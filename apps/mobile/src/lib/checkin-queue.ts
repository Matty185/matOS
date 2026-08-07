import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";
import { apiPost, type ApiErrorBody } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// Stage M7 ("Offline hardening... check-in queued offline and submitted
// on reconnect with server-side timestamp reconciliation"). Unlike
// tagging's local drafts (Stage M3, a per-breakdown file), this is one
// small global queue of pending check-in attempts — AsyncStorage (already
// used for the Supabase session itself) is the right tool here, not the
// heavier expo-file-system Directory/File approach tagging needed for
// its larger, structured, per-entity state.
//
// Namespaced by user id, same reasoning as Stage M3's gate fix for
// tagging drafts: on a shared device, a check-in queued while offline
// under one account must not get submitted under a different account's
// session after a sign-out/sign-in. NOT cleared on sign-out (Stage M7
// gate fix, security-reviewer) — clearing was never what provided that
// guarantee (the per-user key does, on its own), and unconditionally
// deleting a not-yet-synced entry on sign-out would silently discard a
// real, already-completed user action for no security benefit. A queue
// left behind by an account that signs out just sits dormant under that
// account's own key until they sign back in.
async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) throw new Error("checkin-queue: no authenticated user");
  return uid;
}

function storageKeyFor(userId: string): string {
  return `matos:checkin-queue:${userId}`;
}

export type QueuedCheckIn = {
  localId: string;
  classId: string;
  attemptedAt: string; // ISO — the moment the athlete actually tapped Check In
  syncStatus: "pending" | "syncing" | "error";
  syncError: string | null;
};

async function readQueueFor(userId: string): Promise<QueuedCheckIn[]> {
  const raw = await AsyncStorage.getItem(storageKeyFor(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedCheckIn[];
  } catch {
    return [];
  }
}

async function writeQueueFor(userId: string, queue: QueuedCheckIn[]): Promise<void> {
  await AsyncStorage.setItem(storageKeyFor(userId), JSON.stringify(queue));
}

// Only ever called from account.tsx's SoloDeleteAction — deliberately NOT
// wired into sign-out (see the module comment above: sign-out is
// reversible, clearing there would discard a real, not-yet-synced
// completed action). Deletion is different: the account can never sign
// back in, so a queue entry left under its key becomes permanently
// orphaned dead data rather than dormant-until-next-sign-in (Stage M9
// gate fix, security-reviewer).
export async function clearCheckInQueueFor(userId: string): Promise<void> {
  await AsyncStorage.removeItem(storageKeyFor(userId));
}

export async function enqueueCheckIn(classId: string, ownerId: string): Promise<QueuedCheckIn> {
  const queue = await readQueueFor(ownerId);
  const entry: QueuedCheckIn = {
    localId: Crypto.randomUUID(),
    classId,
    attemptedAt: new Date().toISOString(),
    syncStatus: "pending",
    syncError: null,
  };
  queue.push(entry);
  await writeQueueFor(ownerId, queue);
  return entry;
}

// Server rejections that will never succeed on retry, however many times
// it's resent — dropped from the queue rather than retried forever.
// "network_error" (apiPost's own code for a request that never reached
// the server at all) is the one non-terminal case: left queued for the
// next reconnect attempt.
const TERMINAL_CODES = new Set([
  "ALREADY_CHECKED_IN",
  "TOO_LATE",
  "TOO_EARLY",
  "NOT_TODAY",
  "CLASS_NOT_FOUND",
  "CLASS_INACTIVE",
  "TIMESTAMP_TOO_OLD",
  "INVALID_TIMESTAMP",
  "VALIDATION_ERROR",
]);

// ownerId is captured once by the caller (flushCheckInQueue, below) and
// threaded through every read/write in this pass — Stage M7 gate fix
// (code-reviewer, HIGH): the original version re-resolved "whoever's
// currently signed in" on every single AsyncStorage call, so a sign-out/
// sign-in on a shared device *while a pass was still awaiting a network
// call* could persist one account's queued entry under a different
// account's storage key, and — since apiPost's own bearer-token
// resolution independently reads the current session too — submit that
// entry's check-in authenticated as the *new* account. Pinning ownerId
// for the whole pass, and re-checking it hasn't changed before every
// individual send (below), closes both halves of that gap: storage stays
// scoped to who the entry actually belongs to, and a mid-pass account
// change stops the pass rather than risk misattributing a submission.
async function runFlushPass(ownerId: string): Promise<QueuedCheckIn[]> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return readQueueFor(ownerId);

  let queue = await readQueueFor(ownerId);

  // A "syncing" status is only ever meant to be visible transiently,
  // between the write at the top of this loop and the write that follows
  // the network call resolving. If the process was killed in between
  // (an everyday mobile occurrence — the OS reclaiming a backgrounded
  // app, a user swiping the app away the instant signal returns), the
  // entry is left durably marked "syncing" with nothing to ever move it
  // on — flushCheckInQueue's own single-flight coalescing means a fresh
  // pass finding "syncing" at its own start can only mean recovery from
  // exactly that interruption, never "another pass is already handling
  // this" (Stage M7 gate fix, code-reviewer, HIGH).
  let recoveredAny = false;
  for (const entry of queue) {
    if (entry.syncStatus === "syncing") {
      entry.syncStatus = "pending";
      recoveredAny = true;
    }
  }
  if (recoveredAny) await writeQueueFor(ownerId, queue);

  for (const entry of queue) {
    if (entry.syncStatus !== "pending" && entry.syncStatus !== "error") continue;

    const activeUserId = await currentUserId().catch(() => null);
    if (activeUserId !== ownerId) break;

    entry.syncStatus = "syncing";
    await writeQueueFor(ownerId, queue);

    const result = await apiPost("/api/attendance/check-in", {
      class_id: entry.classId,
      attempted_at: entry.attemptedAt,
    });

    if (result.ok) {
      queue = queue.filter((q) => q.localId !== entry.localId);
      await writeQueueFor(ownerId, queue);
      continue;
    }

    const error = result.error as ApiErrorBody;
    if (error.code === "network_error") {
      entry.syncStatus = "pending";
      await writeQueueFor(ownerId, queue);
      break; // still offline — no point trying the rest of the queue now
    }
    if (TERMINAL_CODES.has(error.code)) {
      queue = queue.filter((q) => q.localId !== entry.localId);
      await writeQueueFor(ownerId, queue);
      continue;
    }
    // Unexpected server error — kept for a future retry rather than
    // silently dropping a real check-in attempt.
    entry.syncStatus = "error";
    entry.syncError = error.error ?? "Something went wrong.";
    await writeQueueFor(ownerId, queue);
  }
  return readQueueFor(ownerId);
}

// Same coalescing shape as tagging-sync.ts's syncBreakdownDraft (Stage M3
// gate fix): concurrent flush callers share one in-flight pass rather
// than racing independent ones, with a trailing rerun so a check-in
// queued mid-pass isn't left stranded until some unrelated future
// trigger. Check-in has its own DB-level idempotency backstop regardless
// (attendance_no_duplicate_checkin's unique constraint on
// member_id/class_id/checked_in_date — a duplicate submit fails cleanly
// as ALREADY_CHECKED_IN rather than creating a phantom row the way an
// unguarded tag creation once could), so this is about avoiding wasted
// duplicate requests, not preventing data corruption.
//
// Keyed by ownerId (Stage M9 gate fix, security-reviewer, MEDIUM) — the
// original version used one bare global slot, not actually scoped to
// which owner's pass it was, since ownerId was only resolved *inside* the
// async body after the synchronous piggyback check already ran. On a
// shared device, account A's in-flight pass could be piggybacked onto by
// account B's own flush call the moment B signed in — B's promise would
// then resolve to A's queue data, and B's own newly-enqueued entry
// wouldn't be touched by that pass at all. Taking ownerId as a plain
// synchronous parameter (mirroring tagging-sync.ts's
// syncBreakdownDraft(breakdownId) exactly) lets the map lookup happen
// before any async gap, so two different owners' calls can never coalesce
// with each other — only genuinely-simultaneous same-owner calls do.
const inFlightFlushes = new Map<string, Promise<QueuedCheckIn[]>>();
const pendingRerun = new Set<string>();

export function flushCheckInQueue(ownerId: string): Promise<QueuedCheckIn[]> {
  const existing = inFlightFlushes.get(ownerId);
  if (existing) {
    pendingRerun.add(ownerId);
    return existing;
  }

  const promise = (async () => {
    let result = await runFlushPass(ownerId);
    while (pendingRerun.has(ownerId)) {
      pendingRerun.delete(ownerId);
      result = await runFlushPass(ownerId);
    }
    return result;
  })().finally(() => {
    inFlightFlushes.delete(ownerId);
  });

  inFlightFlushes.set(ownerId, promise);
  return promise;
}

export function useCheckInQueue() {
  // The reactive session from auth-context, not currentUserId()'s async
  // AsyncStorage read — synchronously available (React state, kept fresh
  // by onAuthStateChange) so ownerId is known before flushCheckInQueue's
  // own synchronous coalescing check runs, per the fix above.
  const { session } = useAuth();
  const ownerId = session?.user.id;
  const [queue, setQueue] = useState<QueuedCheckIn[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const wasOffline = useRef(false);

  const refresh = useCallback(async () => {
    if (!ownerId) return;
    setQueue(await readQueueFor(ownerId));
  }, [ownerId]);

  const flush = useCallback(async () => {
    if (!ownerId) return;
    setIsFlushing(true);
    try {
      setQueue(await flushCheckInQueue(ownerId));
    } finally {
      setIsFlushing(false);
    }
  }, [ownerId]);

  const enqueue = useCallback(
    async (classId: string) => {
      if (!ownerId) return;
      await enqueueCheckIn(classId, ownerId);
      await refresh();
      flush();
    },
    [ownerId, refresh, flush],
  );

  useEffect(() => {
    refresh().then(() => flush());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected;
      if (isOnline && wasOffline.current) flush();
      wasOffline.current = !isOnline;
    });
    return unsubscribe;
  }, [flush]);

  return { queue, isFlushing, flush, enqueue };
}
