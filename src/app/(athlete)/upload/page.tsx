"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Loader2, Video, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AnalysisEventLog,
  type AnalysisEventForDisplay,
} from "@/components/shared/analysis-event-log";
import { AnalysisStatsSummary } from "@/components/shared/analysis-stats-summary";
import { computeAthleteAnalysisStats } from "@/lib/analysis/stats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AnalysisRow = {
  id: string;
  title: string;
  status: "pending" | "complete" | "failed";
  method: "ai_stub" | "manual";
  analysed_at: string | null;
  duration_seconds: number | null;
  result: "win" | "loss" | "draw" | null;
};

// Video analysis: an AI quick-analysis stub (upload -> loading -> a mock
// timestamped event log — no video is ever stored, see /api/video/upload)
// plus a fully manual path (a dedicated in-browser player where the video
// never leaves your device at all — see /upload/[id]). Both produce the
// same hard-metrics shape: a timestamped event log, not technique tips.
export default function UploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [latestAnalysisId, setLatestAnalysisId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: analyses, isLoading } = useQuery({
    queryKey: ["my-analyses"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: member } = await supabase
        .from("members")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!member) return [];
      const { data, error } = await supabase
        .from("analyses")
        .select("id, title, status, method, analysed_at, duration_seconds, result")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnalysisRow[];
    },
  });

  const { data: statsInputs } = useQuery({
    queryKey: ["my-analysis-stats"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: member } = await supabase
        .from("members")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!member) return null;

      const { data: analysisRows, error: analysesError } = await supabase
        .from("analyses")
        .select("id, status, duration_seconds, result")
        .eq("member_id", member.id);
      if (analysesError) throw analysesError;

      const { data: eventRows, error: eventsError } = await supabase
        .from("analysis_events")
        .select("analysis_id, event_type")
        .eq("member_id", member.id);
      if (eventsError) throw eventsError;

      return { analyses: analysisRows ?? [], events: eventRows ?? [] };
    },
  });

  const { data: latestEvents } = useQuery({
    queryKey: ["analysis-events", latestAnalysisId],
    enabled: !!latestAnalysisId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("analysis_events")
        .select("id, event_type, timestamp_seconds, duration_seconds, notes")
        .eq("analysis_id", latestAnalysisId as string)
        .order("timestamp_seconds", { ascending: true });
      if (error) throw error;
      return data as AnalysisEventForDisplay[];
    },
  });

  const stats = statsInputs
    ? computeAthleteAnalysisStats(statsInputs.analyses, statsInputs.events)
    : null;
  const latestAnalysis = analyses?.find((a) => a.id === latestAnalysisId) ?? null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setLatestAnalysisId(null);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/video/upload", { method: "POST", body: formData });
      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }

      setLatestAnalysisId(body.analysis.id);
      toast.success("Analysis complete.");
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
      queryClient.invalidateQueries({ queryKey: ["my-analysis-stats"] });
    } catch {
      toast.error("Something went wrong — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function startManualLog() {
    setCreatingManual(true);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Match — ${format(new Date(), "MMM d, yyyy")}` }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }
      router.push(`/upload/${body.analysis.id}`);
    } catch {
      toast.error("Something went wrong — try again.");
    } finally {
      setCreatingManual(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Video Analysis</h1>

      {stats ? <AnalysisStatsSummary stats={stats} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button
            className="h-11"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" /> AI quick analysis
              </>
            )}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Up to 500MB, 3 AI analyses/day. Your video is analysed and discarded — never stored.
          </p>
        </div>

        <div className="rounded-md border p-4">
          <Button
            variant="outline"
            className="h-11"
            disabled={creatingManual}
            onClick={startManualLog}
          >
            {creatingManual ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...
              </>
            ) : (
              <>
                <NotebookPen className="mr-2 h-4 w-4" /> Manually log a match
              </>
            )}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Time-stamp events yourself while watching your video — it stays in your browser and is
            never uploaded. No daily limit.
          </p>
        </div>
      </div>

      {latestAnalysis ? (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-lg font-medium">{latestAnalysis.title}</h2>
          <AnalysisEventLog events={latestEvents ?? []} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Past analyses</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !analyses || analyses.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No analyses yet"
            description="Upload a training clip or manually log a match to get started."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {analyses.map((row) => (
              <li key={row.id}>
                <AnalysisListRow
                  row={row}
                  href={row.method === "manual" ? `/upload/${row.id}` : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AnalysisListRow({ row, href }: { row: AnalysisRow; href?: string }) {
  const content = (
    <div className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-accent/50">
      <div className="flex flex-col gap-0.5">
        <span>{row.title}</span>
        <span className="text-xs text-muted-foreground">
          {row.method === "manual" ? "Manually logged" : "AI quick analysis"}
          {row.analysed_at
            ? ` · ${format(new Date(row.analysed_at), "MMM d, yyyy 'at' h:mm a")}`
            : ""}
        </span>
      </div>
      <Badge
        variant={
          row.status === "complete"
            ? "default"
            : row.status === "failed"
              ? "destructive"
              : "outline"
        }
      >
        {row.status === "pending" && row.method === "manual" ? "in progress" : row.status}
      </Badge>
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}
