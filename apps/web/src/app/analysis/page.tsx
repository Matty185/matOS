"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Swords, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { GymTeaser } from "@/components/shared/gym-teaser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type BreakdownRow = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
  visibility: "private" | "gym";
  author_id: string | null;
  member_id: string | null;
  external_person_id: string | null;
  members: { first_name: string; last_name: string } | null;
  external_people: { display_name: string } | null;
  breakdown_events: { count: number }[];
};

// RLS scopes the row set by role already (athlete: own-authored only;
// coach/owner: everything in gym — breakdowns_select_staff /
// breakdowns_all_own) — this page doesn't re-filter, it just adapts what
// it *displays* per role (staff additionally sees who authored each row).
function useCurrentMember() {
  return useQuery({
    queryKey: ["current-member"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      // public.current_member() RPC, not a direct .eq("user_id", user.id)
      // query — the latter throws once this account has more than one
      // members row (Stage S2: a personal workspace plus a real gym).
      const { data: current } = await supabase.rpc("current_member");
      const data = current?.[0] ?? null;
      // author_id on breakdowns references auth.users(id) — keep the auth
      // uid alongside the member row so callers can compare against it,
      // not the member row's own id (a different uuid).
      return data ? { ...data, userId: user.id } : null;
    },
  });
}

function useBreakdowns() {
  return useQuery({
    queryKey: ["breakdowns"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdowns")
        .select(
          "id, name, match_date, gi, status, visibility, author_id, member_id, external_person_id, members(first_name, last_name), external_people(display_name), breakdown_events(count)",
        )
        .order("match_date", { ascending: false });
      if (error) throw error;
      return data as unknown as BreakdownRow[];
    },
  });
}

export default function AnalysisPage() {
  const { data: currentMember } = useCurrentMember();
  const { data: breakdowns, isLoading, error } = useBreakdowns();
  const isStaff = currentMember?.role === "coach" || currentMember?.role === "gym_owner";
  const isSolo = currentMember?.gym_kind === "personal";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl tracking-wide">Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {isSolo
              ? "Your logged match breakdowns."
              : isStaff
                ? "Match breakdowns across your gym."
                : "Your logged match breakdowns."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href="/analysis/people">
              <Users className="mr-2 h-4 w-4" /> External people
            </Link>
          </Button>
          <Button asChild className="h-11">
            <Link href="/analysis/new">
              <Plus className="mr-2 h-4 w-4" /> Log a match
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load breakdowns. Try refreshing.</p>
      ) : !breakdowns || breakdowns.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="No breakdowns yet"
          description="Log a match to start tagging positions and events."
          actionLabel="Log a match"
          actionHref="/analysis/new"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {breakdowns.map((b) => {
            const focusName = b.members
              ? `${b.members.first_name} ${b.members.last_name}`
              : (b.external_people?.display_name ?? "Unknown");
            const eventCount = b.breakdown_events[0]?.count ?? 0;
            return (
              <li key={b.id}>
                <Link
                  href={`/analysis/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      <Badge variant="outline">{b.gi ? "Gi" : "No-Gi"}</Badge>
                      {b.visibility === "private" ? <Badge variant="outline">Private</Badge> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {focusName} · {format(new Date(b.match_date), "MMM d, yyyy")} · {eventCount}{" "}
                      {eventCount === 1 ? "event" : "events"}
                      {isStaff && b.author_id && b.author_id !== currentMember?.userId
                        ? " · by another member"
                        : ""}
                    </span>
                  </div>
                  <Badge variant={b.status === "complete" ? "default" : "outline"}>
                    {b.status === "complete" ? "complete" : "in progress"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isSolo ? <GymTeaser /> : null}
    </div>
  );
}
