"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BreakdownEditDialog } from "@/components/shared/breakdown-edit-dialog";
import { TaggingScreen } from "@/components/shared/tagging-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const RESULT_LABELS = { win: "Win", loss: "Loss", draw: "Draw" } as const;
const METHOD_LABELS = {
  submission: "Submission",
  points: "Points",
  decision: "Decision",
  dq: "DQ",
} as const;

type BreakdownDetail = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
  result: keyof typeof RESULT_LABELS | null;
  method: keyof typeof METHOD_LABELS | null;
  author_id: string | null;
  video_filename: string | null;
  video_duration_seconds: number | null;
  member_id: string | null;
  external_person_id: string | null;
  members: { first_name: string; last_name: string } | null;
  external_people: { display_name: string } | null;
};

function useCurrentUserId() {
  return useQuery({
    queryKey: ["current-user-id"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
  });
}

export default function BreakdownDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUserId } = useCurrentUserId();
  const [deleting, setDeleting] = useState(false);

  const {
    data: breakdown,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["breakdown", params.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdowns")
        .select(
          "id, name, match_date, gi, status, result, method, author_id, video_filename, video_duration_seconds, member_id, external_person_id, members(first_name, last_name), external_people(display_name)",
        )
        .eq("id", params.id)
        .single();
      if (error) throw error;
      return data as unknown as BreakdownDetail;
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (error || !breakdown) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load this breakdown — it may not exist, or you may not have access to it.
      </p>
    );
  }

  const focusName = breakdown.members
    ? `${breakdown.members.first_name} ${breakdown.members.last_name}`
    : (breakdown.external_people?.display_name ?? "Unknown");
  const profileHref = breakdown.member_id
    ? `/analysis/athlete/${breakdown.member_id}`
    : breakdown.external_person_id
      ? `/analysis/people/${breakdown.external_person_id}`
      : null;

  // RLS grants staff SELECT on every breakdown in the gym but UPDATE only
  // on ones they authored (plan §7) — showing Edit unconditionally led a
  // coach straight into a working-looking dialog whose save silently 404s
  // (RLS blocks the write). Only render it when the viewer can actually
  // use it. Found in Stage A2 code review. DELETE follows the same RLS
  // policy (breakdowns_all_own is author-scoped for every operation, not
  // just UPDATE), so canEdit gates both.
  const canEdit = currentUserId !== undefined && breakdown.author_id === currentUserId;

  async function handleDelete() {
    if (!breakdown) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/breakdowns/${breakdown.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Breakdown deleted.");
        router.push("/analysis");
      } else {
        const body = await res.json();
        toast.error(body.error ?? "Couldn't delete this breakdown.");
        setDeleting(false);
      }
    } catch {
      toast.error("Couldn't delete this breakdown.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/analysis"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to breakdowns
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl tracking-wide">{breakdown.name}</h1>
          <p className="text-sm text-muted-foreground">
            {profileHref ? (
              <Link href={profileHref} className="underline-offset-2 hover:underline">
                {focusName}
              </Link>
            ) : (
              focusName
            )}{" "}
            · {format(new Date(breakdown.match_date), "MMM d, yyyy")}
          </p>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <BreakdownEditDialog
              breakdownId={breakdown.id}
              defaultValues={{
                name: breakdown.name,
                match_date: breakdown.match_date,
                gi: breakdown.gi,
                result: breakdown.result ?? undefined,
                method: breakdown.method ?? undefined,
              }}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["breakdown", params.id] })}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11">
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{breakdown.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes this breakdown and every position/event tagged in it.
                    This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="h-11" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{breakdown.gi ? "Gi" : "No-Gi"}</Badge>
        <Badge variant={breakdown.status === "complete" ? "default" : "outline"}>
          {breakdown.status === "complete" ? "complete" : "in progress"}
        </Badge>
        {breakdown.result ? (
          <Badge variant="outline">{RESULT_LABELS[breakdown.result]}</Badge>
        ) : null}
        {breakdown.method ? (
          <Badge variant="outline">{METHOD_LABELS[breakdown.method]}</Badge>
        ) : null}
      </div>

      <TaggingScreen
        breakdownId={breakdown.id}
        readOnly={!canEdit}
        status={breakdown.status}
        storedVideoFilename={breakdown.video_filename}
        storedVideoDurationSeconds={breakdown.video_duration_seconds}
        onStatusChange={() => queryClient.invalidateQueries({ queryKey: ["breakdown", params.id] })}
      />
    </div>
  );
}
