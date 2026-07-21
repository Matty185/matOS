"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AnalysisLogger } from "@/components/shared/analysis-logger";

// Manual match-logging page for an athlete's own analysis. Ownership is
// enforced entirely by RLS (analysis_events_all_self /
// analyses_update_self) when AnalysisLogger queries Supabase directly — no
// member id needs to be threaded through here.
export default function AthleteAnalysisLogPage({ params }: { params: { id: string } }) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/upload"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to analyses
      </Link>
      <AnalysisLogger analysisId={params.id} backHref="/upload" />
    </div>
  );
}
