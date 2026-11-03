"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchHoldsCoveringDate } from "@/lib/payments/holds";
import { useGymToday } from "@/hooks/use-gym-today";

/**
 * Flow audit 2.4: ids of members whose hold covers this month (gym
 * calendar), for "On hold" badges. Staff only (RLS returns an athlete just
 * their own). Empty while loading or on error: a badge is a hint, nothing
 * depends on it.
 */
const NONE: Set<string> = new Set();

export function useMembersOnHold(): { ids: Set<string>; isLoading: boolean } {
  const today = useGymToday();
  const { data, isPending } = useQuery({
    queryKey: ["holds-today", today],
    enabled: !!today,
    queryFn: async () => {
      const holds = await fetchHoldsCoveringDate(createClient(), today!);
      return new Set(holds.map((h) => h.member_id));
    },
  });
  // A stable empty set, so callers' memo dependencies don't churn.
  return { ids: data ?? NONE, isLoading: !today || isPending };
}
