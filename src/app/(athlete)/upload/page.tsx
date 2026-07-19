"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Upload, Loader2, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AnalysisRow = {
  id: string;
  title: string;
  status: "pending" | "complete" | "failed";
  analysed_at: string | null;
  report: {
    summary: string;
    detected_techniques: { name: string; note: string }[];
    overall_notes: string;
  } | null;
};

// Video stub: upload -> loading -> mock report. No video is ever stored —
// see /api/video/upload for the actual process-and-discard handling.
export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [latestReport, setLatestReport] = useState<AnalysisRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: past, isLoading } = useQuery({
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
        .select("id, title, status, analysed_at, report")
        .eq("member_id", member.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnalysisRow[];
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setLatestReport(null);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/video/upload", { method: "POST", body: formData });
      const body = await res.json();

      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }

      setLatestReport(body.analysis);
      toast.success("Analysis complete.");
      queryClient.invalidateQueries({ queryKey: ["my-analyses"] });
    } catch {
      toast.error("Something went wrong — try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Video Analysis</h1>

      <div className="rounded-md border p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <Button className="h-11" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" /> Upload video
            </>
          )}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Up to 500MB, 3 uploads/day. Your video is analysed and discarded — never stored.
        </p>
      </div>

      {latestReport ? (
        <div className="flex flex-col gap-3 rounded-md border p-4">
          <h2 className="text-lg font-medium">{latestReport.title}</h2>
          {latestReport.report ? (
            <>
              <p className="text-sm">{latestReport.report.summary}</p>
              <ul className="flex flex-col gap-2">
                {latestReport.report.detected_techniques.map((t, i) => (
                  <li key={i} className="rounded-md bg-muted p-2 text-sm">
                    <span className="font-medium">{t.name}</span> — {t.note}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{latestReport.report.overall_notes}</p>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Past analyses</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !past || past.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No analyses yet"
            description="Upload a training clip to get a mock technique breakdown."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md border p-3 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span>{row.title}</span>
                  {row.analysed_at ? (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(row.analysed_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                  ) : null}
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
                  {row.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
