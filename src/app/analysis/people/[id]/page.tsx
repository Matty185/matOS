"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";

type PersonBreakdown = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
};

// Their info + breakdown list only — the "computed profile" plan §6
// describes for this screen is Stage A5's job (profile computation isn't
// built yet). This is the honest A2-scoped subset, not a stand-in for it.
export default function ExternalPersonDetailPage({ params }: { params: { id: string } }) {
  const {
    data: person,
    isLoading: personLoading,
    error: personError,
  } = useQuery({
    queryKey: ["external-person", params.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name, notes")
        .eq("id", params.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: breakdowns,
    isLoading: breakdownsLoading,
    error: breakdownsError,
  } = useQuery({
    queryKey: ["breakdowns", "external-person", params.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id, name, match_date, gi, status")
        .eq("external_person_id", params.id)
        .order("match_date", { ascending: false });
      if (error) throw error;
      return data as PersonBreakdown[];
    },
  });

  if (personLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (personError || !person) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load this person — they may not exist, or you may not have access to them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/analysis/people"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to external people
      </Link>

      <div>
        <h1 className="font-heading text-2xl tracking-wide">{person.display_name}</h1>
        {person.notes ? <p className="text-sm text-muted-foreground">{person.notes}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Breakdowns</h2>
        {breakdownsLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : breakdownsError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load breakdowns. Try refreshing.</p>
        ) : !breakdowns || breakdowns.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="No breakdowns yet"
            description="Matches logged about this person will show up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {breakdowns.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/analysis/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(b.match_date), "MMM d, yyyy")} · {b.gi ? "Gi" : "No-Gi"}
                    </span>
                  </div>
                  <Badge variant={b.status === "complete" ? "default" : "outline"}>
                    {b.status === "complete" ? "complete" : "in progress"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
