"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProfileView } from "@/components/shared/profile-view";
import { BeltDisplay } from "@/components/shared/belt-display";

function useCurrentMember() {
  return useQuery({
    queryKey: ["current-member"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("members")
        .select("id, role")
        .eq("user_id", user.id)
        .single();
      return data;
    },
  });
}

// A gym member's computed profile. Plan §6 describes this screen as
// "reached from member profile" — that wiring (replacing the mock
// Analysis tab on /members/[id]) is explicitly Stage A7's job, not this
// one. This route is the actual profile screen Stage A5 is scoped to
// build; A7 either keeps this as the canonical deep link or adds a
// shortcut to it from the member profile page, whichever turns out
// simpler once that stage starts — no rework implied either way. Reached
// today via a "View profile" link on a breakdown's detail page.
export default function AthleteProfilePage({ params }: { params: { id: string } }) {
  const { data: currentMember, isLoading: currentMemberLoading } = useCurrentMember();

  const {
    data: member,
    isLoading: memberLoading,
    error,
  } = useQuery({
    queryKey: ["member", params.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, belt, stripes")
        .eq("id", params.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (memberLoading || currentMemberLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (error || !member) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load this member — they may not exist, or you may not have access to them.
      </p>
    );
  }

  // RLS on breakdowns already scopes what ProfileView's query can see
  // (plan §7: staff see all in gym, an athlete only their own-authored
  // rows) — this is a UX-layer check on top of that (CLAUDE.md Rule 2),
  // so a random athlete hitting another member's profile URL gets a clear
  // "not yours to view" message instead of a confusingly empty profile
  // that looks like the member just has no data yet.
  const isStaff = currentMember?.role === "coach" || currentMember?.role === "gym_owner";
  const isSelf = currentMember?.id === member.id;

  if (!isStaff && !isSelf) {
    return (
      <p className="text-sm text-destructive">
        You don&apos;t have access to this athlete&apos;s profile.
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

      <div className="flex items-center gap-3">
        <h1 className="font-heading text-2xl tracking-wide">
          {member.first_name} {member.last_name}
        </h1>
        <BeltDisplay belt={member.belt} stripes={member.stripes} />
      </div>

      <ProfileView subject={{ type: "member", id: member.id }} />
    </div>
  );
}
