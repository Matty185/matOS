"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AnalysisEventLog } from "@/components/shared/analysis-event-log";
import { createAnalysisEventSchema } from "@/lib/validation/analysis";
import {
  DURATION_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  RESULT_LABELS,
  RESULT_METHOD_LABELS,
} from "@/lib/analysis/labels";
import type { AnalysisEventType, AnalysisResult } from "@/lib/analysis/stats";
import type { Database } from "@/types/database";

type AnalysisResultMethod = Database["public"]["Enums"]["analysis_result_method"];

type AnalysisRow = {
  id: string;
  title: string;
  status: "pending" | "complete" | "failed";
  method: "ai_stub" | "manual";
  duration_seconds: number | null;
  opponent_name: string | null;
  result: AnalysisResult | null;
  result_method: AnalysisResultMethod | null;
};

type EventRow = {
  id: string;
  event_type: AnalysisEventType;
  timestamp_seconds: number;
  duration_seconds: number | null;
  notes: string | null;
};

type EventFormValues = {
  event_type: AnalysisEventType;
  timestamp_seconds: number;
  duration_seconds?: number | null;
  notes?: string;
};

// Manual video-timestamping tool, shared between the athlete's own
// analysis page and the coach's on-behalf-of-an-athlete page. The video
// file never leaves the browser — loaded via a local file picker into a
// blob URL, played back natively, and only the resulting structured
// events (timestamp/type/duration/notes) are ever POSTed anywhere. Works
// identically whether the underlying analysis was started manually or is
// an AI-stub result being corrected: same event list, same "Add"/delete
// controls either way.
export function AnalysisLogger({ analysisId, backHref }: { analysisId: string; backHref: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [captureStart, setCaptureStart] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const videoUrlRef = useRef<string | null>(null);

  // Revoke only on genuine unmount (empty deps) — not keyed on [videoUrl].
  // React 18 Strict Mode double-invokes effects in dev, which would run
  // this cleanup immediately after a fresh URL.createObjectURL() call if
  // it were keyed on videoUrl, revoking the blob before the <video> ever
  // loads it. Replacement (picking a different file) is handled explicitly
  // in handleFileChange instead, via the ref.
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ["analysis", analysisId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("analyses")
        .select("id, title, status, method, duration_seconds, opponent_name, result, result_method")
        .eq("id", analysisId)
        .single();
      if (error) throw error;
      return data as AnalysisRow;
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["analysis-events", analysisId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("analysis_events")
        .select("id, event_type, timestamp_seconds, duration_seconds, notes")
        .eq("analysis_id", analysisId)
        .order("timestamp_seconds", { ascending: true });
      if (error) throw error;
      return data as EventRow[];
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(createAnalysisEventSchema) as never,
    defaultValues: {
      event_type: "takedown",
      timestamp_seconds: 0,
      duration_seconds: null,
      notes: "",
    },
  });

  const selectedType = watch("event_type");
  const isDurationType = DURATION_EVENT_TYPES.has(selectedType);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
  }

  function useCurrentTime() {
    setValue("timestamp_seconds", Math.round(videoRef.current?.currentTime ?? 0));
  }

  function startCapture() {
    setCaptureStart(videoRef.current?.currentTime ?? 0);
    toast.info('Capture started — hit "End" when the position ends.');
  }

  function endCapture() {
    if (captureStart === null) return;
    const end = videoRef.current?.currentTime ?? captureStart;
    setValue("timestamp_seconds", Math.round(captureStart));
    setValue("duration_seconds", Math.max(1, Math.round(end - captureStart)));
    setCaptureStart(null);
  }

  async function onSubmit(data: EventFormValues) {
    const res = await fetch(`/api/analyses/${analysisId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: data.event_type,
        timestamp_seconds: data.timestamp_seconds,
        duration_seconds: isDurationType ? (data.duration_seconds ?? null) : null,
        notes: data.notes || null,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }
    reset({ event_type: data.event_type, timestamp_seconds: 0, duration_seconds: null, notes: "" });
    queryClient.invalidateQueries({ queryKey: ["analysis-events", analysisId] });
  }

  async function deleteEvent(eventId: string) {
    const res = await fetch(`/api/analyses/${analysisId}/events/${eventId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete that event.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["analysis-events", analysisId] });
  }

  if (analysisLoading || !analysis) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-wide">{analysis.title}</h1>
          <p className="text-sm text-muted-foreground">
            {analysis.method === "manual" ? "Manually logged" : "AI quick analysis"} ·{" "}
            {analysis.status === "complete" ? "Finished" : "In progress"}
          </p>
        </div>
        <Button className="h-11 shrink-0" onClick={() => setDetailsOpen(true)}>
          {analysis.status === "complete" ? "Edit details" : "Finish"}
        </Button>
      </div>

      <div className="rounded-md border p-4">
        {videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- local, ephemeral user footage, never transcoded/stored
          <video ref={videoRef} src={videoUrl} controls className="w-full rounded-md" />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Load your match video to time-stamp events while you watch. The video stays in your
              browser — it&apos;s never uploaded anywhere.
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-11"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />{" "}
          {videoUrl ? "Choose a different file" : "Select video file"}
        </Button>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3 rounded-md border p-4"
        noValidate
      >
        <p className="text-sm font-medium">Log an event</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Event type</Label>
            <Controller
              name="event_type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timestamp_seconds">Timestamp (seconds)</Label>
            <div className="flex gap-2">
              <Input
                id="timestamp_seconds"
                type="number"
                className="h-11"
                {...register("timestamp_seconds", { valueAsNumber: true })}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={useCurrentTime}
                disabled={!videoUrl}
              >
                Use current time
              </Button>
            </div>
            {errors.timestamp_seconds ? (
              <p className="text-sm text-destructive">{errors.timestamp_seconds.message}</p>
            ) : null}
          </div>
        </div>

        {isDurationType ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration_seconds">Duration (seconds)</Label>
            <div className="flex gap-2">
              <Input
                id="duration_seconds"
                type="number"
                className="h-11"
                {...register("duration_seconds", {
                  setValueAs: (v) => (v === "" ? null : Number(v)),
                })}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={startCapture}
                disabled={!videoUrl}
              >
                Start
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={endCapture}
                disabled={captureStart === null}
              >
                End
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea id="notes" {...register("notes")} />
        </div>

        <Button type="submit" className="h-11 self-start" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add event"}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Events ({events?.length ?? 0})</p>
        {eventsLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <AnalysisEventLog events={events ?? []} onDelete={deleteEvent} />
        )}
      </div>

      <MatchDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        analysis={analysis}
        analysisId={analysisId}
        onSaved={() => {
          const wasFinishing = analysis.status !== "complete";
          queryClient.invalidateQueries({ queryKey: ["analysis", analysisId] });
          if (wasFinishing) router.push(backHref);
        }}
      />
    </div>
  );
}

type DetailsFormValues = {
  title: string;
  duration_seconds: number | null;
  opponent_name: string;
  result: AnalysisResult | "";
  result_method: AnalysisResultMethod | "";
};

function MatchDetailsDialog({
  open,
  onOpenChange,
  analysis,
  analysisId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: AnalysisRow;
  analysisId: string;
  onSaved: () => void;
}) {
  const isFinishing = analysis.status !== "complete";
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<DetailsFormValues>({
    defaultValues: {
      title: analysis.title,
      duration_seconds: analysis.duration_seconds,
      opponent_name: analysis.opponent_name ?? "",
      result: analysis.result ?? "",
      result_method: analysis.result_method ?? "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      title: analysis.title,
      duration_seconds: analysis.duration_seconds,
      opponent_name: analysis.opponent_name ?? "",
      result: analysis.result ?? "",
      result_method: analysis.result_method ?? "",
    });
  }, [open, analysis, reset]);

  async function onSubmit(data: DetailsFormValues) {
    const res = await fetch(`/api/analyses/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        duration_seconds: data.duration_seconds ?? undefined,
        opponent_name: data.opponent_name || null,
        result: data.result || null,
        result_method: data.result_method || null,
        mark_complete: isFinishing || undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error ?? "Something went wrong.");
      return;
    }
    toast.success(isFinishing ? "Match logged." : "Details updated.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isFinishing ? "Finish logging this match" : "Edit match details"}
          </DialogTitle>
          <DialogDescription>
            Total duration and outcome — feeds this athlete&apos;s stats profile.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" className="h-11" {...register("title")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="duration_seconds">Match duration (seconds)</Label>
            <Input
              id="duration_seconds"
              type="number"
              className="h-11"
              {...register("duration_seconds", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opponent_name">Opponent (optional)</Label>
            <Input id="opponent_name" className="h-11" {...register("opponent_name")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Result</Label>
            <Controller
              name="result"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESULT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Method</Label>
            <Controller
              name="result_method"
              control={control}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Not recorded" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESULT_METHOD_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="submit" className="h-11" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : isFinishing ? "Finish match" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
