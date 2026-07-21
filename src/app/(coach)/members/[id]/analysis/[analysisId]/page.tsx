"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AnalysisLogger } from "@/components/shared/analysis-logger";

// Coach/owner logging a match on behalf of an athlete — same AnalysisLogger
// as the athlete's own page; ownership is enforced by RLS
// (analysis_events_all_staff / analyses_update_staff, gym-scoped) when it
// queries Supabase directly, not by anything passed in here.
export default function CoachAnalysisLogPage({
  params,
}: {
  params: { id: string; analysisId: string };
}) {
  const backHref = `/members/${params.id}`;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to member profile
      </Link>
      <AnalysisLogger analysisId={params.analysisId} backHref={backHref} />
    </div>
  );
}
