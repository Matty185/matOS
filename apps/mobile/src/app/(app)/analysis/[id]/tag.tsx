import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiPatch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useCurrentMember } from "@/lib/use-current-member";
import {
  addPositionTag,
  addEventTag,
  updatePositionTag,
  updateEventTag,
  deletePositionTag,
  deleteEventTag,
  getOpenInterval,
  hasUnsyncedChanges,
  type DraftPosition,
  type DraftEvent,
} from "@/lib/tagging-draft";
import { useTaggingSync, syncBreakdownDraft } from "@/lib/tagging-sync";
import { VideoControls } from "@/components/tagging/video-controls";
import { CategoryRail } from "@/components/tagging/category-rail";
import { TaggingOverlay } from "@/components/tagging/tagging-overlay";
import { TimelineSheet } from "@/components/tagging/timeline-sheet";
import type { PositionRef, EventTypeRef } from "@matos/shared";

type PendingTagInput = { type: "category"; category: string } | { type: "position" };
type PendingTag =
  { type: "category"; category: string; ts: number } | { type: "position"; ts: number };

type UndoState = { kind: "position" | "event"; localId: string; label: string; expiresAt: number };

// The native tagging player — Stage M3, matos_mobile_plan.md §3.3: "The
// web fullscreen constraints do not exist in RN — the app owns the
// screen." Presented as a fullScreenModal (see analysis/_layout.tsx), not
// embedded in the breakdown detail screen — landscape-locked for the
// duration, portrait restored on exit (root _layout.tsx owns the default
// portrait lock; this screen is the one deliberate override).
export default function TaggingPlayerScreen() {
  const { id, videoUri } = useLocalSearchParams<{ id: string; videoUri: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  useKeepAwake();

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const player = useVideoPlayer(videoUri, (p) => {
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { currentTime } = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });
  const { duration } = useEvent(player, "sourceLoad", {
    videoSource: null,
    duration: player.duration,
    availableVideoTracks: [],
    availableSubtitleTracks: [],
    availableAudioTracks: [],
  });
  const [playbackRate, setPlaybackRate] = useState(1);

  const { data: member } = useCurrentMember();

  const { data: breakdown } = useQuery({
    queryKey: ["breakdown", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id, status, author_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Defense in depth — the breakdown-detail screen already only offers
  // this route's entry point (the "Start tagging" button) to the author
  // (Stage M3 gate fix, security-reviewer); this catches a direct/deep
  // link. Every write still goes through RLS-scoped routes regardless,
  // so this alone was never the security boundary — it exists because a
  // non-author reaching this screen could otherwise generate local tags
  // that permanently fail to sync, stuck in that device's draft file.
  useEffect(() => {
    if (breakdown && member && breakdown.author_id !== member.userId) {
      router.back();
    }
  }, [breakdown, member, router]);

  const { data: positions } = useQuery({
    queryKey: ["taxonomy-positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, name, roles")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as unknown as PositionRef[];
    },
  });

  const { data: eventTypes } = useQuery({
    queryKey: ["taxonomy-event-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_types")
        .select(
          "id, category, name, modifier_options, modifier_required, outcome_required, outcome_options",
        )
        .eq("active", true)
        .order("category")
        .order("name");
      if (error) throw error;
      return data as unknown as EventTypeRef[];
    },
  });

  const eventsByCategory = useMemo(() => {
    const map = new Map<string, EventTypeRef[]>();
    for (const et of eventTypes ?? []) {
      const list = map.get(et.category) ?? [];
      list.push(et);
      map.set(et.category, list);
    }
    return map;
  }, [eventTypes]);
  const positionsById = useMemo(
    () => new Map((positions ?? []).map((p) => [p.id, p])),
    [positions],
  );
  const eventTypesById = useMemo(
    () => new Map((eventTypes ?? []).map((e) => [e.id, e])),
    [eventTypes],
  );

  const { draft, sync, refreshFromDisk } = useTaggingSync(id);

  const [mode, setMode] = useState<"watching" | "tagging">("watching");
  const [pendingTag, setPendingTag] = useState<PendingTag | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  // The golden rule (matos_tagging_ux_plan.md §2): timestamp is captured
  // here, at the moment of the rail tap, before pause or any overlay
  // navigation — never re-read later at confirm time. Reads player's own
  // live clock, not the `currentTime` React state above — that state only
  // updates once per timeUpdateEventInterval (0.25s), so it can lag the
  // real playback position by up to ~250ms at tap time. Mirrors web's own
  // tagging-screen.tsx, which reads videoRef.current.currentTime first for
  // the identical reason (Stage M3 gate fix, code-reviewer).
  function openTaggingMode(pending: PendingTagInput) {
    const ts = Math.round(player.currentTime * 10) / 10;
    player.pause();
    setPendingTag({ ...pending, ts } as PendingTag);
    setMode("tagging");
  }

  function closeTaggingMode() {
    setPendingTag(null);
    setMode("watching");
    player.play();
  }

  function showUndo(kind: "position" | "event", localId: string, label: string) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const expiresAt = Date.now() + 4000;
    setUndo({ kind, localId, label, expiresAt });
    undoTimer.current = setTimeout(() => setUndo(null), 4000);
  }

  async function handleConfirmEvent(
    eventType: EventTypeRef,
    modifier: string | null,
    outcome: string | null,
  ) {
    if (!id || pendingTag?.type !== "category") return;
    const row = await addEventTag(id, {
      event_type_id: eventType.id,
      modifier,
      outcome,
      ts: pendingTag.ts,
    });
    await refreshFromDisk();
    showUndo("event", row.localId, eventType.name);
    closeTaggingMode();
    sync();
  }

  async function handleConfirmPosition(position: PositionRef, role: string | null) {
    if (!id || pendingTag?.type !== "position") return;
    const row = await addPositionTag(id, {
      position_id: position.id,
      role,
      start_ts: pendingTag.ts,
    });
    await refreshFromDisk();
    showUndo("position", row.localId, position.name);
    closeTaggingMode();
    sync();
  }

  async function handleUndo() {
    if (!undo || !id) return;
    // Deletes the exact row the toast refers to (its real draft localId,
    // captured at confirm time) rather than a "most recent create"
    // heuristic — that heuristic broke the moment sync() (fired
    // unawaited on confirm) won the race against the 4s toast window: the
    // row's pendingOp flips to null the instant it syncs, so "most recent
    // create" would find nothing and undo would silently no-op while the
    // toast still dismissed as if it worked (Stage M3 gate fix,
    // code-reviewer). deletePositionTag/deleteEventTag already handle
    // both the not-yet-synced and already-synced cases correctly.
    if (undo.kind === "position") {
      await deletePositionTag(id, undo.localId);
    } else {
      await deleteEventTag(id, undo.localId);
    }
    await refreshFromDisk();
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }

  async function handleUpdatePosition(
    localId: string,
    patch: Partial<Pick<DraftPosition, "role" | "start_ts" | "end_ts">>,
  ) {
    if (!id) return;
    await updatePositionTag(id, localId, patch);
    await refreshFromDisk();
    sync();
  }
  async function handleDeletePosition(localId: string) {
    if (!id) return;
    await deletePositionTag(id, localId);
    await refreshFromDisk();
    sync();
  }
  async function handleUpdateEvent(
    localId: string,
    patch: Partial<Pick<DraftEvent, "modifier" | "outcome" | "ts">>,
  ) {
    if (!id) return;
    await updateEventTag(id, localId, patch);
    await refreshFromDisk();
    sync();
  }
  async function handleDeleteEvent(localId: string) {
    if (!id) return;
    await deleteEventTag(id, localId);
    await refreshFromDisk();
    sync();
  }

  const [finishing, setFinishing] = useState(false);
  async function toggleStatus() {
    if (!id || !breakdown) return;
    setFinishing(true);
    try {
      const nextStatus = breakdown.status === "complete" ? "in_progress" : "complete";
      if (nextStatus === "complete" && draft) {
        const open = getOpenInterval(draft);
        if (open) {
          await updatePositionTag(id, open.localId, {
            end_ts: Math.round(player.currentTime * 10) / 10,
          });
          await refreshFromDisk();
        }
      }
      // Best-effort flush before flipping status — the sync engine will
      // keep retrying on its own regardless if this particular attempt
      // can't reach the network right now (matches the plan's "explicit
      // save" framing: Finish is the one moment a full flush is
      // deliberately attempted, not just opportunistically triggered).
      await syncBreakdownDraft(id);
      await apiPatch(`/api/breakdowns/${id}`, { status: nextStatus });
      queryClient.invalidateQueries({ queryKey: ["breakdown", id] });
    } finally {
      setFinishing(false);
    }
  }

  const unsyncedCount = draft
    ? draft.positions.filter((p) => p.pendingOp !== null).length +
      draft.events.filter((e) => e.pendingOp !== null).length
    : 0;

  return (
    <View className="flex-1 bg-black">
      <View className="flex-1">
        <VideoView
          player={player}
          nativeControls={false}
          style={{ flex: 1 }}
          contentFit="contain"
        />

        {mode === "watching" ? (
          <>
            <SafeAreaView
              edges={["top"]}
              className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-3 py-2"
            >
              <Pressable
                onPress={() => router.back()}
                className="h-11 items-center justify-center px-2"
              >
                <Text className="font-sans-bold text-sm text-white">✕ Close</Text>
              </Pressable>
              <Text className="font-sans text-xs text-white">
                {unsyncedCount > 0 ? `${unsyncedCount} pending sync` : "All synced"}
              </Text>
              <Pressable
                onPress={toggleStatus}
                disabled={finishing || !breakdown}
                className="h-11 items-center justify-center rounded-md bg-primary px-3 disabled:opacity-60"
              >
                <Text className="font-sans-bold text-sm text-white">
                  {breakdown?.status === "complete" ? "Reopen" : "Finish"}
                </Text>
              </Pressable>
            </SafeAreaView>

            <CategoryRail
              onSelectCategory={(category) => openTaggingMode({ type: "category", category })}
              onSelectPosition={() => openTaggingMode({ type: "position" })}
            />
          </>
        ) : null}

        {mode === "tagging" && pendingTag ? (
          <TaggingOverlay
            ts={pendingTag.ts}
            initial={
              pendingTag.type === "category"
                ? { type: "category", category: pendingTag.category }
                : { type: "position" }
            }
            positions={positions ?? []}
            eventsByCategory={eventsByCategory}
            onConfirmEvent={handleConfirmEvent}
            onConfirmPosition={handleConfirmPosition}
            onCancel={closeTaggingMode}
          />
        ) : null}

        {undo ? (
          <View className="absolute bottom-24 left-4 right-4 flex-row items-center justify-between rounded-md bg-neutral-900 px-4 py-3">
            <Text className="flex-1 font-sans text-sm text-white">Tagged: {undo.label}</Text>
            <Pressable onPress={handleUndo} className="h-11 items-center justify-center px-2">
              <Text className="font-sans-bold text-sm text-primary">Undo</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {mode === "watching" ? (
        <VideoControls
          playing={isPlaying}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          onTogglePlay={() => (isPlaying ? player.pause() : player.play())}
          onSeek={(seconds) => {
            player.currentTime = seconds;
          }}
          onSetPlaybackRate={(rate) => {
            player.playbackRate = rate;
            setPlaybackRate(rate);
          }}
        />
      ) : null}

      {mode === "watching" && draft ? (
        <TimelineSheet
          positions={draft.positions}
          events={draft.events}
          positionsById={positionsById}
          eventTypesById={eventTypesById}
          duration={duration}
          onUpdatePosition={handleUpdatePosition}
          onDeletePosition={handleDeletePosition}
          onUpdateEvent={handleUpdateEvent}
          onDeleteEvent={handleDeleteEvent}
        />
      ) : null}
    </View>
  );
}

// Exported for the breakdown detail screen's own "unsynced changes"
// warning if navigating away mid-session — kept here rather than
// duplicated, since it's this screen's own draft-shape knowledge.
export { hasUnsyncedChanges };
