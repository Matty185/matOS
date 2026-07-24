"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { humanize, formatVideoTimestamp } from "@/lib/format/humanize";
import { TagEditDialog } from "@/components/shared/tag-edit-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PositionRef = { id: string; name: string; roles: string[] | null };
type EventTypeRef = {
  id: string;
  category: string;
  name: string;
  modifier_options: string[] | null;
  modifier_required: boolean;
  outcome_required: boolean;
  outcome_options: string[] | null;
};
type PositionRow = {
  id: string;
  position_id: string;
  role: string | null;
  start_ts: number;
  end_ts: number | null;
};
type EventRow = {
  id: string;
  event_type_id: string;
  modifier: string | null;
  outcome: string | null;
  ts: number;
};

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

// Shared row shape for both tag lists (positions/events), both readOnly
// and editable — extracted after the two lists' near-identical
// button-vs-plain-li branches were flagged as duplicated JSX in Stage A3
// code review. Renders a button (opens the edit dialog) when onClick is
// supplied, a plain row otherwise.
function TagListRow({
  label,
  timestamp,
  onClick,
}: {
  label: string;
  timestamp: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{timestamp}</span>
    </>
  );
  if (!onClick) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        {content}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left text-sm hover:bg-accent/50"
        onClick={onClick}
      >
        {content}
      </button>
    </li>
  );
}

// The core tagging UI (Stage A3): local-only video playback (Non-Negotiable
// #1 — the file never leaves the browser, only structured tags get
// POSTed), position intervals, event tagging with the tap -> auto-pause ->
// confirm -> resume flow (plan §6), a read-only timeline overview, and a
// properly-sized (44px) list for the actual edit/delete interaction — the
// timeline's markers are necessarily too small to reliably meet the touch-
// target standard once a match has more than a handful of tags, so the
// list is the accessible primary surface, not a fallback.
//
// Deliberately NOT built here (Stage A4's stated scope): local-draft
// persistence across page reloads, and the filename/duration mismatch
// warning on resume. Every tag here saves to the server immediately on
// creation/edit/delete — each action IS the save, not a draft queued
// behind a separate "Save" button.
export function TaggingScreen({
  breakdownId,
  readOnly = false,
}: {
  breakdownId: string;
  // Staff can SELECT any breakdown in their gym but only author-write
  // (plan §7) — a coach viewing a gym-mate's breakdown sees the tag lists
  // but no video player/tagging controls or edit access, rather than a
  // working-looking UI whose writes RLS would silently reject.
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoUrlRef = useRef<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);

  const [pendingEvent, setPendingEvent] = useState<{ eventType: EventTypeRef; ts: number } | null>(
    null,
  );
  const [confirmModifier, setConfirmModifier] = useState("");
  const [confirmOutcome, setConfirmOutcome] = useState("");
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  const [editingPosition, setEditingPosition] = useState<PositionRow | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  // Revoke only on genuine unmount, not keyed on the changing videoUrl —
  // React 18 Strict Mode double-invokes effects in dev, which would
  // revoke a freshly created blob URL before the video ever loaded it if
  // this were keyed on [videoUrl]. Same fix as the scrapped hard-metrics
  // rework's video player hit earlier.
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  const { data: positions } = useQuery({
    queryKey: ["taxonomy-positions"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("positions")
        .select("id, name, roles")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        roles: p.roles as unknown as string[] | null,
      })) as PositionRef[];
    },
  });

  const { data: eventTypes } = useQuery({
    queryKey: ["taxonomy-event-types"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("event_types")
        .select(
          "id, category, name, modifier_options, modifier_required, outcome_required, outcome_options",
        )
        .eq("active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((e) => ({
        ...e,
        modifier_options: e.modifier_options as unknown as string[] | null,
        outcome_options: e.outcome_options as unknown as string[] | null,
      })) as EventTypeRef[];
    },
  });

  const { data: breakdownPositions } = useQuery({
    queryKey: ["breakdown-positions", breakdownId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdown_positions")
        .select("id, position_id, role, start_ts, end_ts")
        .eq("breakdown_id", breakdownId)
        .order("start_ts", { ascending: true });
      if (error) throw error;
      return data as PositionRow[];
    },
  });

  const { data: breakdownEvents } = useQuery({
    queryKey: ["breakdown-events", breakdownId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdown_events")
        .select("id, event_type_id, modifier, outcome, ts")
        .eq("breakdown_id", breakdownId)
        .order("ts", { ascending: true });
      if (error) throw error;
      return data as EventRow[];
    },
  });

  function refetchTags() {
    queryClient.invalidateQueries({ queryKey: ["breakdown-positions", breakdownId] });
    queryClient.invalidateQueries({ queryKey: ["breakdown-events", breakdownId] });
  }

  const openInterval = useMemo(
    () => (breakdownPositions ?? []).find((p) => p.end_ts === null) ?? null,
    [breakdownPositions],
  );

  const eventsByCategory = useMemo(() => {
    const groups = new Map<string, EventTypeRef[]>();
    for (const et of eventTypes ?? []) {
      const list = groups.get(et.category);
      if (list) list.push(et);
      else groups.set(et.category, [et]);
    }
    return groups;
  }, [eventTypes]);

  const positionById = useMemo(() => new Map((positions ?? []).map((p) => [p.id, p])), [positions]);
  const eventTypeById = useMemo(
    () => new Map((eventTypes ?? []).map((e) => [e.id, e])),
    [eventTypes],
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
  }

  async function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setVideoDuration(video.duration);
    const fileName = fileInputRef.current?.files?.[0]?.name;
    if (!fileName) return;
    // Best-effort — recording what file this session used, for Stage A4's
    // resume-mismatch check. Not shown to the user, no toast either way.
    await fetch(`/api/breakdowns/${breakdownId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_filename: fileName,
        video_duration_seconds: Math.round(video.duration),
      }),
    }).catch(() => {});
  }

  function setSpeed(rate: number) {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  async function tagPosition(positionId: string, role: string | null) {
    setExpandedPositionId(null);
    const startTs = Math.round((videoRef.current?.currentTime ?? currentTime) * 10) / 10;
    const res = await fetch(`/api/breakdowns/${breakdownId}/positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position_id: positionId, role, start_ts: startTs }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }
    refetchTags();
  }

  function handlePositionTap(position: PositionRef) {
    if (position.roles && position.roles.length > 0) {
      setExpandedPositionId((current) => (current === position.id ? null : position.id));
      return;
    }
    tagPosition(position.id, null);
  }

  function handleEventTap(eventType: EventTypeRef) {
    const video = videoRef.current;
    const ts = Math.round((video?.currentTime ?? currentTime) * 10) / 10;
    video?.pause();
    setConfirmModifier("");
    setConfirmOutcome("");
    setPendingEvent({ eventType, ts });
  }

  async function confirmEvent() {
    if (!pendingEvent) return;
    const { eventType, ts } = pendingEvent;
    if (eventType.modifier_required && !confirmModifier) {
      toast.error("Pick a modifier.");
      return;
    }
    if (eventType.outcome_required && !confirmOutcome) {
      toast.error("Pick an outcome.");
      return;
    }
    setConfirmSubmitting(true);
    try {
      const res = await fetch(`/api/breakdowns/${breakdownId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type_id: eventType.id,
          modifier: confirmModifier || null,
          outcome: confirmOutcome || null,
          ts,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }
      setPendingEvent(null);
      refetchTags();
      videoRef.current?.play();
    } finally {
      setConfirmSubmitting(false);
    }
  }

  function cancelEvent() {
    setPendingEvent(null);
    videoRef.current?.play();
  }

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? (
        <p className="text-sm text-muted-foreground">
          Viewing another member&apos;s breakdown — only its author can tag or edit it.
        </p>
      ) : null}

      {!readOnly ? (
        <>
          <div className="rounded-md border p-4">
            {videoUrl ? (
              <div className="flex justify-center overflow-hidden rounded-md bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- local, ephemeral user footage, never transcoded/stored */}
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="max-h-[60vh] w-auto max-w-full"
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Load your match video to start tagging. The video stays in your browser — it&apos;s
                never uploaded anywhere.
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />{" "}
                {videoUrl ? "Choose a different file" : "Select video file"}
              </Button>
              {videoUrl ? (
                <>
                  <span className="font-mono text-sm">{formatVideoTimestamp(currentTime)}</span>
                  <div className="flex gap-1">
                    {SPEEDS.map((speed) => (
                      <Button
                        key={speed}
                        type="button"
                        size="sm"
                        variant={playbackRate === speed ? "default" : "outline"}
                        className="h-11 min-w-11"
                        onClick={() => setSpeed(speed)}
                      >
                        {speed}×
                      </Button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {videoUrl ? (
            <>
              <div className="flex flex-col gap-2 rounded-md border p-4">
                <p className="text-sm font-medium">Position</p>
                {/* items-start: default stretch would make every column on
                    a flex-wrap row match the tallest one, leaving visible
                    whitespace under shorter buttons whenever a sibling's
                    role sub-picker is expanded. Found in Stage A3 code
                    review. */}
                <div className="flex flex-wrap items-start gap-2">
                  {(positions ?? []).map((position) => (
                    <div key={position.id} className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant={openInterval?.position_id === position.id ? "default" : "outline"}
                        className="h-11"
                        onClick={() => handlePositionTap(position)}
                      >
                        {humanize(position.name)}
                      </Button>
                      {expandedPositionId === position.id && position.roles ? (
                        <div className="flex flex-wrap gap-2 pl-2">
                          {position.roles.map((role) => (
                            <Button
                              key={role}
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-11"
                              onClick={() => tagPosition(position.id, role)}
                            >
                              {humanize(role)}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                {openInterval ? (
                  <p className="text-xs text-muted-foreground">
                    Currently tagging:{" "}
                    {humanize(positionById.get(openInterval.position_id)?.name ?? "")}
                    {openInterval.role ? ` (${humanize(openInterval.role)})` : ""} — since{" "}
                    {formatVideoTimestamp(openInterval.start_ts)}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-4 rounded-md border p-4">
                <p className="text-sm font-medium">Events</p>
                {Array.from(eventsByCategory.entries()).map(([category, events]) => (
                  <div key={category} className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {humanize(category)}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {events.map((eventType) => (
                        <Button
                          key={eventType.id}
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => handleEventTap(eventType)}
                        >
                          {humanize(eventType.name)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {videoDuration ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Timeline</p>
                  <div className="relative h-8 w-full rounded-md bg-muted" aria-hidden="true">
                    {(breakdownPositions ?? []).map((p) => (
                      <div
                        key={p.id}
                        className="absolute top-0 h-4 rounded bg-primary/40"
                        style={{
                          left: `${(p.start_ts / videoDuration) * 100}%`,
                          width: `${(((p.end_ts ?? videoDuration) - p.start_ts) / videoDuration) * 100}%`,
                        }}
                        title={humanize(positionById.get(p.position_id)?.name ?? "")}
                      />
                    ))}
                    {(breakdownEvents ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="absolute bottom-0 h-4 w-1 -translate-x-1/2 rounded bg-destructive"
                        style={{ left: `${(ev.ts / videoDuration) * 100}%` }}
                        title={humanize(eventTypeById.get(ev.event_type_id)?.name ?? "")}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overview only — use the lists below to edit or delete a tag.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {/* Always visible regardless of whether a video is loaded in this
          session — these are the persisted tags, not tied to the current
          local video-playback state. Only the panels/timeline above need
          an active video. */}
      <>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Positions logged ({breakdownPositions?.length ?? 0})
          </p>
          {!breakdownPositions || breakdownPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No positions tagged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {breakdownPositions.map((p) => (
                <TagListRow
                  key={p.id}
                  label={`${humanize(positionById.get(p.position_id)?.name ?? "")}${p.role ? ` — ${humanize(p.role)}` : ""}`}
                  timestamp={`${formatVideoTimestamp(p.start_ts)}${p.end_ts !== null ? ` – ${formatVideoTimestamp(p.end_ts)}` : " – ongoing"}`}
                  onClick={readOnly ? undefined : () => setEditingPosition(p)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Events logged ({breakdownEvents?.length ?? 0})</p>
          {!breakdownEvents || breakdownEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events tagged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {breakdownEvents.map((ev) => (
                <TagListRow
                  key={ev.id}
                  label={`${humanize(eventTypeById.get(ev.event_type_id)?.name ?? "")}${ev.modifier ? ` — ${humanize(ev.modifier)}` : ""}${ev.outcome ? ` (${humanize(ev.outcome)})` : ""}`}
                  timestamp={formatVideoTimestamp(ev.ts)}
                  onClick={readOnly ? undefined : () => setEditingEvent(ev)}
                />
              ))}
            </ul>
          )}
        </div>
      </>

      <Dialog open={pendingEvent !== null} onOpenChange={(open) => !open && cancelEvent()}>
        <DialogContent>
          {pendingEvent ? (
            <>
              <DialogHeader>
                <DialogTitle>{humanize(pendingEvent.eventType.name)}</DialogTitle>
                <DialogDescription>at {formatVideoTimestamp(pendingEvent.ts)}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                {pendingEvent.eventType.modifier_options ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Modifier
                      {pendingEvent.eventType.modifier_required ? " (required)" : " (optional)"}
                    </Label>
                    <Select value={confirmModifier || undefined} onValueChange={setConfirmModifier}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Pick one" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingEvent.eventType.modifier_options.map((m) => (
                          <SelectItem key={m} value={m}>
                            {humanize(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {pendingEvent.eventType.outcome_options ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>
                      Outcome
                      {pendingEvent.eventType.outcome_required ? " (required)" : " (optional)"}
                    </Label>
                    <Select value={confirmOutcome || undefined} onValueChange={setConfirmOutcome}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Pick one" />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingEvent.eventType.outcome_options.map((o) => (
                          <SelectItem key={o} value={o}>
                            {humanize(o)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {!pendingEvent.eventType.modifier_options &&
                !pendingEvent.eventType.outcome_options ? (
                  <p className="text-sm text-muted-foreground">No details needed — just confirm.</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="h-11" onClick={cancelEvent}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="h-11"
                  disabled={confirmSubmitting}
                  onClick={confirmEvent}
                >
                  {confirmSubmitting ? "Saving..." : "Confirm"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {editingPosition ? (
        <TagEditDialog
          kind="position"
          open={editingPosition !== null}
          onOpenChange={(open) => !open && setEditingPosition(null)}
          breakdownId={breakdownId}
          row={editingPosition}
          positionLabel={humanize(positionById.get(editingPosition.position_id)?.name ?? "")}
          roleOptions={positionById.get(editingPosition.position_id)?.roles ?? null}
          onSaved={refetchTags}
        />
      ) : null}

      {editingEvent ? (
        <TagEditDialog
          kind="event"
          open={editingEvent !== null}
          onOpenChange={(open) => !open && setEditingEvent(null)}
          breakdownId={breakdownId}
          row={editingEvent}
          eventLabel={humanize(eventTypeById.get(editingEvent.event_type_id)?.name ?? "")}
          modifierOptions={eventTypeById.get(editingEvent.event_type_id)?.modifier_options ?? null}
          outcomeOptions={eventTypeById.get(editingEvent.event_type_id)?.outcome_options ?? null}
          onSaved={refetchTags}
        />
      ) : null}
    </div>
  );
}
