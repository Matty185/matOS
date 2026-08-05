import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import type { PositionRow, EventRow } from "@matos/shared";

// Stage M3's local-first offline model: every tag write lands here first
// (instant, works with zero network), never as a direct server round-trip
// from the UI layer — the tagging screen reads/writes only through this
// module. A separate sync engine (tagging-sync.ts) opportunistically
// pushes queued operations to the same web API routes web's own tagging
// screen uses, in strict creation order (required for the tag_position
// RPC's interval-closing logic to reconstruct the same sequence of
// intervals regardless of how much time passed before syncing — see
// CLAUDE.md's Stage M3 Decision Log entry). Web has no equivalent to this
// file: its own tagging-screen.tsx saves every action directly to the
// server, since it has no offline requirement at all.
//
// Unlike web (which always trusts the server as the live source of
// truth), this draft file IS the source of truth for an active tagging
// session on this device — the UI never re-fetches breakdown_positions/
// breakdown_events mid-session. It's only hydrated from the server once,
// the first time a breakdown is opened on this device; a draft that
// already exists locally is trusted as-is from then on (single-author, no
// collaboration — Non-Negotiable #8 — so there's no other device/session
// racing to merge against in practice).

export type SyncStatus = "pending" | "syncing" | "synced" | "error";
export type PendingOp = "create" | "update" | "delete";

export type DraftPosition = {
  localId: string;
  serverId: string | null;
  position_id: string;
  role: string | null;
  start_ts: number;
  end_ts: number | null;
  syncStatus: SyncStatus;
  pendingOp: PendingOp | null;
  syncError: string | null;
};

export type DraftEvent = {
  localId: string;
  serverId: string | null;
  event_type_id: string;
  modifier: string | null;
  outcome: string | null;
  ts: number;
  syncStatus: SyncStatus;
  pendingOp: PendingOp | null;
  syncError: string | null;
};

export type BreakdownDraft = {
  breakdownId: string;
  positions: DraftPosition[];
  events: DraftEvent[];
  updatedAt: string;
};

// Namespaced by user id (Stage M3 gate fix, security-reviewer): draft
// files were originally keyed only by breakdownId, with no per-account
// scoping and nothing clearing them on sign-out — on a shared device, a
// second account signing in could see (and even resume/sync) the first
// account's in-progress local tags. supabase.auth.getSession() reads from
// the client's own in-memory/AsyncStorage cache, not a network call, so
// this stays cheap to call on every draft operation.
async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error("tagging-draft: no authenticated user");
  return uid;
}

// Lazy — constructing a Directory/File touches the native module
// immediately (validatePath() runs in the constructor), which isn't
// available on the web platform in this SDK version. The tagging player
// is never used on web anyway (no meaningful touch/fullscreen/orientation
// testing is possible there — same honestly-scoped limitation as every
// prior mobile stage), but a module-level constant would evaluate at
// import time regardless of whether any of these functions are ever
// called, crashing the entire app's web bundle rather than just this
// feature. Computing it inside each function keeps the crash (if it ever
// happens) scoped to an actual tagging-draft call, not module load.
async function draftsDir(): Promise<Directory> {
  return new Directory(Paths.document, "breakdown-drafts", await currentUserId());
}

async function draftFile(breakdownId: string): Promise<File> {
  return new File(await draftsDir(), `${breakdownId}.json`);
}

async function ensureDraftsDir(): Promise<void> {
  const dir = await draftsDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
}

async function readDraftFile(breakdownId: string): Promise<BreakdownDraft | null> {
  const file = await draftFile(breakdownId);
  if (!file.exists) return null;
  const raw = await file.text();
  return JSON.parse(raw) as BreakdownDraft;
}

async function writeDraftFile(draft: BreakdownDraft): Promise<void> {
  await ensureDraftsDir();
  draft.updatedAt = new Date().toISOString();
  const file = await draftFile(draft.breakdownId);
  if (!file.exists) file.create();
  file.write(JSON.stringify(draft));
}

// Called before sign-out (account.tsx) so this device's local tagging
// drafts don't linger into a different account's session on a shared
// device — must run while the session is still valid, since resolving
// which subdirectory to remove needs the current user's id (Stage M3
// gate fix, security-reviewer).
export async function clearCurrentUserDrafts(): Promise<void> {
  const dir = await draftsDir();
  if (dir.exists) dir.delete();
}

// First-open hydration only — reads whatever's already on the server and
// seeds the local draft with it, all marked synced. Never called again
// for a breakdown that already has a local draft file.
async function hydrateFromServer(breakdownId: string): Promise<BreakdownDraft> {
  const [{ data: positions }, { data: events }] = await Promise.all([
    supabase
      .from("breakdown_positions")
      .select("id, position_id, role, start_ts, end_ts")
      .eq("breakdown_id", breakdownId)
      .order("start_ts"),
    supabase
      .from("breakdown_events")
      .select("id, event_type_id, modifier, outcome, ts")
      .eq("breakdown_id", breakdownId)
      .order("ts"),
  ]);

  const draft: BreakdownDraft = {
    breakdownId,
    positions: ((positions ?? []) as PositionRow[]).map((p) => ({
      localId: p.id,
      serverId: p.id,
      position_id: p.position_id,
      role: p.role,
      start_ts: p.start_ts,
      end_ts: p.end_ts,
      syncStatus: "synced",
      pendingOp: null,
      syncError: null,
    })),
    events: ((events ?? []) as EventRow[]).map((e) => ({
      localId: e.id,
      serverId: e.id,
      event_type_id: e.event_type_id,
      modifier: e.modifier,
      outcome: e.outcome,
      ts: e.ts,
      syncStatus: "synced",
      pendingOp: null,
      syncError: null,
    })),
    updatedAt: new Date().toISOString(),
  };

  await writeDraftFile(draft);
  return draft;
}

export async function loadDraft(breakdownId: string): Promise<BreakdownDraft> {
  const existing = await readDraftFile(breakdownId);
  if (existing) return existing;
  return hydrateFromServer(breakdownId);
}

export function getOpenInterval(draft: BreakdownDraft): DraftPosition | undefined {
  return draft.positions.find((p) => p.end_ts === null && p.pendingOp !== "delete");
}

// Mirrors the tag_position RPC's own semantics locally: close whatever
// interval is currently open (using the new tag's own start as the close
// point), then add the new open-ended one. Kept in sync with the server
// function's behavior deliberately — see tag-position-rpc parity note in
// CLAUDE.md's Stage M3 Decision Log.
export async function addPositionTag(
  breakdownId: string,
  input: { position_id: string; role: string | null; start_ts: number },
): Promise<DraftPosition> {
  const draft = await loadDraft(breakdownId);

  const open = getOpenInterval(draft);
  if (open) {
    open.end_ts = input.start_ts;
    if (open.pendingOp === null) open.pendingOp = "update";
  }

  const newPosition: DraftPosition = {
    localId: Crypto.randomUUID(),
    serverId: null,
    position_id: input.position_id,
    role: input.role,
    start_ts: input.start_ts,
    end_ts: null,
    syncStatus: "pending",
    pendingOp: "create",
    syncError: null,
  };
  draft.positions.push(newPosition);
  await writeDraftFile(draft);
  return newPosition;
}

export async function addEventTag(
  breakdownId: string,
  input: { event_type_id: string; modifier: string | null; outcome: string | null; ts: number },
): Promise<DraftEvent> {
  const draft = await loadDraft(breakdownId);
  const newEvent: DraftEvent = {
    localId: Crypto.randomUUID(),
    serverId: null,
    event_type_id: input.event_type_id,
    modifier: input.modifier,
    outcome: input.outcome,
    ts: input.ts,
    syncStatus: "pending",
    pendingOp: "create",
    syncError: null,
  };
  draft.events.push(newEvent);
  await writeDraftFile(draft);
  return newEvent;
}

export async function updatePositionTag(
  breakdownId: string,
  localId: string,
  patch: Partial<Pick<DraftPosition, "role" | "start_ts" | "end_ts">>,
): Promise<void> {
  const draft = await loadDraft(breakdownId);
  const row = draft.positions.find((p) => p.localId === localId);
  if (!row) return;
  Object.assign(row, patch);
  if (row.pendingOp === null) {
    row.pendingOp = "update";
    row.syncStatus = "pending";
  }
  await writeDraftFile(draft);
}

export async function updateEventTag(
  breakdownId: string,
  localId: string,
  patch: Partial<Pick<DraftEvent, "modifier" | "outcome" | "ts">>,
): Promise<void> {
  const draft = await loadDraft(breakdownId);
  const row = draft.events.find((e) => e.localId === localId);
  if (!row) return;
  Object.assign(row, patch);
  if (row.pendingOp === null) {
    row.pendingOp = "update";
    row.syncStatus = "pending";
  }
  await writeDraftFile(draft);
}

// Deleting a tag never reopens an interval it had closed — matches every
// existing delete path in this app (web included); undo follows the same
// rule for the same reason (Stage M3 research confirmed this is
// deliberate, documented web behavior, not an oversight to "fix" here).
export async function deletePositionTag(breakdownId: string, localId: string): Promise<void> {
  const draft = await loadDraft(breakdownId);
  const row = draft.positions.find((p) => p.localId === localId);
  if (!row) return;
  if (row.pendingOp === "create") {
    // Never synced — nothing server-side to delete, just drop it.
    draft.positions = draft.positions.filter((p) => p.localId !== localId);
  } else {
    row.pendingOp = "delete";
    row.syncStatus = "pending";
  }
  await writeDraftFile(draft);
}

export async function deleteEventTag(breakdownId: string, localId: string): Promise<void> {
  const draft = await loadDraft(breakdownId);
  const row = draft.events.find((e) => e.localId === localId);
  if (!row) return;
  if (row.pendingOp === "create") {
    draft.events = draft.events.filter((e) => e.localId !== localId);
  } else {
    row.pendingOp = "delete";
    row.syncStatus = "pending";
  }
  await writeDraftFile(draft);
}

export async function saveDraft(draft: BreakdownDraft): Promise<void> {
  await writeDraftFile(draft);
}

export function hasUnsyncedChanges(draft: BreakdownDraft): boolean {
  return (
    draft.positions.some((p) => p.pendingOp !== null) ||
    draft.events.some((e) => e.pendingOp !== null)
  );
}
