"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentWaiver, fetchSignedMemberIds, needsWaiver } from "@/lib/waivers";

/**
 * Flow audit 9.3: for staff badges. `missing(member)` is true when the gym
 * has a waiver and this member hasn't signed its current version. While
 * loading, on error, or with no waiver published, nothing is flagged: a
 * badge is a hint, nothing depends on it.
 */
export function useWaiverStatus() {
  const { data, isPending } = useQuery({
    queryKey: ["waiver-status"],
    queryFn: async () => {
      const supabase = createClient();
      const waiver = await fetchCurrentWaiver(supabase);
      if (!waiver) return { waiver: null, signed: new Set<string>() };
      return { waiver, signed: await fetchSignedMemberIds(supabase, waiver.id) };
    },
  });
  // Stable between renders (only changes with the data), so callers can
  // use it in memo dependencies.
  return useMemo(
    () => ({
      waiver: data?.waiver ?? null,
      isLoading: isPending,
      missing: (member: { id: string; role: string; active: boolean }) =>
        !!data?.waiver && member.active && needsWaiver(member) && !data.signed.has(member.id),
    }),
    [data, isPending],
  );
}
