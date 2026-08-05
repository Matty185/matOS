import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { apiPost, apiPatch, apiDelete, type ApiErrorBody } from "@/lib/api";
import {
  loadDraft,
  saveDraft,
  type BreakdownDraft,
  type DraftPosition,
  type DraftEvent,
} from "@/lib/tagging-draft";

// Pushes a breakdown's local draft (tagging-draft.ts) to the same web API
// routes web's own tagging screen uses — never the tag_position RPC
// directly (see CLAUDE.md's Stage M3 Decision Log for why: reusing the
// existing, already-reviewed route keeps error mapping and audit-log
// behavior identical between platforms, matching the pattern established
// since Stage M1's check-in flow).
//
// Position creates are synced strictly in array order (== original tap
// order, since new tags are always appended) and one at a time, waiting
// for each to succeed before sending the next — required for
// tag_position's own "close whatever's open" logic to reconstruct the
// same chain of intervals server-side regardless of how long a device
// was offline. A failed create stops position-array processing entirely
// rather than skipping ahead, since every later position create depends
// on the server's own interval state being caught up first. Events have
// no such dependency (no interval semantics), so their queue is
// independent and keeps going even if the position queue stalls.
//
// Position/event *updates* are synced as plain PATCHes regardless of
// whether the change was a genuine user edit or just this device's own
// local mirror of an interval-close a later create will also trigger
// server-side (the tag_position RPC recomputes the same end_ts
// independently) — sending it anyway is a harmless redundant call, not a
// correctness risk, and far simpler than trying to detect and skip the
// "already implied by a later create" case.

async function syncPosition(breakdownId: string, row: DraftPosition): Promise<boolean> {
  if (row.pendingOp === "create") {
    const result = await apiPost(`/api/breakdowns/${breakdownId}/positions`, {
      position_id: row.position_id,
      role: row.role,
      start_ts: row.start_ts,
      // Idempotency key — a retried create (lost response, or a stale
      // request that outraces the in-flight guard) is a safe no-op
      // server-side rather than a duplicate/phantom interval.
      client_id: row.localId,
    });
    if (!result.ok) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    const created = (result.data as { position: { id: string } }).position;
    row.serverId = created.id;
    row.pendingOp = null;
    row.syncStatus = "synced";
    row.syncError = null;
    return true;
  }

  if (row.pendingOp === "update" && row.serverId) {
    const result = await apiPatch(`/api/breakdowns/${breakdownId}/positions/${row.serverId}`, {
      role: row.role,
      start_ts: row.start_ts,
      end_ts: row.end_ts,
    });
    if (!result.ok) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    row.pendingOp = null;
    row.syncStatus = "synced";
    row.syncError = null;
    return true;
  }

  if (row.pendingOp === "delete" && row.serverId) {
    const result = await apiDelete(`/api/breakdowns/${breakdownId}/positions/${row.serverId}`);
    // A 404 here means it's already gone server-side (e.g. a retried sync
    // after a prior attempt actually succeeded but the local draft write
    // never confirmed it) — treat as success, matching web's own
    // undo-tolerates-404 behavior.
    if (!result.ok && (result.error as ApiErrorBody).status !== 404) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    return true; // caller removes the row from the array entirely
  }

  return true;
}

async function syncEvent(breakdownId: string, row: DraftEvent): Promise<boolean> {
  if (row.pendingOp === "create") {
    const result = await apiPost(`/api/breakdowns/${breakdownId}/events`, {
      event_type_id: row.event_type_id,
      modifier: row.modifier,
      outcome: row.outcome,
      ts: row.ts,
      client_id: row.localId,
    });
    if (!result.ok) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    const created = (result.data as { event: { id: string } }).event;
    row.serverId = created.id;
    row.pendingOp = null;
    row.syncStatus = "synced";
    row.syncError = null;
    return true;
  }

  if (row.pendingOp === "update" && row.serverId) {
    const result = await apiPatch(`/api/breakdowns/${breakdownId}/events/${row.serverId}`, {
      modifier: row.modifier,
      outcome: row.outcome,
      ts: row.ts,
    });
    if (!result.ok) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    row.pendingOp = null;
    row.syncStatus = "synced";
    row.syncError = null;
    return true;
  }

  if (row.pendingOp === "delete" && row.serverId) {
    const result = await apiDelete(`/api/breakdowns/${breakdownId}/events/${row.serverId}`);
    if (!result.ok && (result.error as ApiErrorBody).status !== 404) {
      row.syncStatus = "error";
      row.syncError = (result.error as ApiErrorBody).error ?? "Sync failed.";
      return false;
    }
    return true;
  }

  return true;
}

async function runSyncPass(breakdownId: string): Promise<BreakdownDraft> {
  const draft = await loadDraft(breakdownId);
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return draft;

  for (const row of draft.positions) {
    if (row.pendingOp === null) continue;
    row.syncStatus = "syncing";
    const ok = await syncPosition(breakdownId, row);
    if (!ok) break; // preserve order — don't sync later creates ahead of a stuck one
  }
  draft.positions = draft.positions.filter(
    (p) => !(p.pendingOp === "delete" && p.syncStatus === "synced"),
  );

  for (const row of draft.events) {
    if (row.pendingOp === null) continue;
    row.syncStatus = "syncing";
    await syncEvent(breakdownId, row);
    // Events are independent of each other — a failure here doesn't block
    // the rest of the event queue the way a position failure does.
  }
  draft.events = draft.events.filter(
    (e) => !(e.pendingOp === "delete" && e.syncStatus === "synced"),
  );

  await saveDraft(draft);
  return draft;
}

// Stage M3 all-reviewer gate fix (database-reviewer, CRITICAL): every tag
// confirm/edit/delete handler in tag.tsx fires sync() unawaited, and
// useTaggingSync also syncs on mount and on every offline→online
// transition — nothing previously stopped two of those from running
// concurrently. Two independent passes both read the same still-pending
// row from disk (the first hasn't written its result back yet) and both
// POST it, producing a duplicate/phantom server row that silently
// corrupts profile-metric aggregation. This coalesces concurrent callers
// onto a single in-flight pass per breakdown, keyed by breakdownId — not
// a plain dedup, though: if a new mutation calls sync() *while* a pass is
// already running, that mutation would otherwise go unsynced until some
// unrelated future trigger (the swallowed call returning the in-flight
// promise as-is), so a rerun is queued and executed immediately after the
// current pass finishes, before the shared promise resolves. Every caller
// still gets a promise that only resolves once a pass has actually
// observed their own draft state.
const inFlightSyncs = new Map<string, Promise<BreakdownDraft>>();
const pendingRerun = new Set<string>();

export function syncBreakdownDraft(breakdownId: string): Promise<BreakdownDraft> {
  const existing = inFlightSyncs.get(breakdownId);
  if (existing) {
    pendingRerun.add(breakdownId);
    return existing;
  }

  const promise = (async () => {
    let result = await runSyncPass(breakdownId);
    while (pendingRerun.has(breakdownId)) {
      pendingRerun.delete(breakdownId);
      result = await runSyncPass(breakdownId);
    }
    return result;
  })().finally(() => {
    inFlightSyncs.delete(breakdownId);
  });

  inFlightSyncs.set(breakdownId, promise);
  return promise;
}

// Auto-syncs on mount and whenever connectivity transitions from offline
// to online; also exposes a manual trigger (used by the Finish action,
// which should make a best-effort attempt to flush the queue before
// marking a breakdown complete).
export function useTaggingSync(breakdownId: string | undefined) {
  const [draft, setDraft] = useState<BreakdownDraft | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOffline = useRef(false);

  const sync = useCallback(async () => {
    if (!breakdownId) return;
    setIsSyncing(true);
    try {
      const result = await syncBreakdownDraft(breakdownId);
      setDraft(result);
    } finally {
      setIsSyncing(false);
    }
  }, [breakdownId]);

  const refreshFromDisk = useCallback(async () => {
    if (!breakdownId) return;
    setDraft(await loadDraft(breakdownId));
  }, [breakdownId]);

  useEffect(() => {
    if (!breakdownId) return;
    refreshFromDisk().then(() => sync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected;
      if (isOnline && wasOffline.current) sync();
      wasOffline.current = !isOnline;
    });
    return unsubscribe;
  }, [sync]);

  return { draft, isSyncing, sync, refreshFromDisk, setDraft };
}
