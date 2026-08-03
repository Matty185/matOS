"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CompareView } from "@/components/shared/compare-view";
import type { ProfileSubject } from "@/lib/analysis/use-athlete-profile";

function isSubjectType(value: string | null): value is ProfileSubject["type"] {
  return value === "member" || value === "external";
}

// UUID shape check on the two id params — not a security boundary (RLS is,
// same as every other read in this module), just avoids sending an
// obviously-malformed id into a query and getting a confusing error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useSubjectName(subject: ProfileSubject | null) {
  return useQuery({
    queryKey: ["compare-subject-name", subject?.type, subject?.id],
    enabled: subject !== null,
    queryFn: async () => {
      if (!subject) return null;
      const supabase = createClient();
      if (subject.type === "member") {
        const { data, error } = await supabase
          .from("members")
          .select("first_name, last_name")
          .eq("id", subject.id)
          .single();
        if (error) throw error;
        return `${data.first_name} ${data.last_name}`;
      }
      const { data, error } = await supabase
        .from("external_people")
        .select("display_name")
        .eq("id", subject.id)
        .single();
      if (error) throw error;
      return data.display_name;
    },
  });
}

function CompareContent() {
  const searchParams = useSearchParams();
  const aType = searchParams.get("aType");
  const aId = searchParams.get("aId");
  const bType = searchParams.get("bType");
  const bId = searchParams.get("bId");

  // The picker dialog already filters subject A out of its own list, but a
  // hand-edited URL can still set a===b (this is a real, typed/shareable
  // link per its own design, not just dialog output) — reject it here too
  // rather than silently rendering two identical columns.
  const valid =
    isSubjectType(aType) &&
    isSubjectType(bType) &&
    aId !== null &&
    bId !== null &&
    UUID_RE.test(aId) &&
    UUID_RE.test(bId) &&
    !(aType === bType && aId === bId);

  const subjectA: ProfileSubject | null = valid ? { type: aType, id: aId } : null;
  const subjectB: ProfileSubject | null = valid ? { type: bType, id: bId } : null;

  const { data: nameA, isLoading: nameALoading, error: nameAError } = useSubjectName(subjectA);
  const { data: nameB, isLoading: nameBLoading, error: nameBError } = useSubjectName(subjectB);

  if (!valid || !subjectA || !subjectB) {
    return (
      <p className="text-sm text-destructive">
        Missing or invalid comparison — pick who to compare from a profile page.
      </p>
    );
  }

  if (nameALoading || nameBLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (nameAError || nameBError || !nameA || !nameB) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load one of these profiles — they may not exist, or you may not have access to
        them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/analysis"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to breakdowns
      </Link>
      <h1 className="font-heading text-2xl tracking-wide">
        {nameA} vs {nameB}
      </h1>
      <CompareView subjectA={subjectA} subjectB={subjectB} nameA={nameA} nameB={nameB} />
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
      <CompareContent />
    </Suspense>
  );
}
