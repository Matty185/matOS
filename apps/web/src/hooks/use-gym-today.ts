"use client";

import { useQuery } from "@tanstack/react-query";
import { DEFAULT_GYM_TIMEZONE, gymWallClock } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";

/**
 * The active gym's today (YYYY-MM-DD in gyms.timezone), not the device's.
 * null while loading. The gym comes from current_member(): since Stage S1 an
 * account can see several gyms rows (a personal workspace plus a real gym), so
 * an unfiltered gyms read could return the wrong zone.
 */
export function useGymToday(): string | null {
  const { data: timeZone } = useQuery({
    queryKey: ["gym-timezone"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: current } = await supabase.rpc("current_member");
      const gymId = current?.[0]?.gym_id;
      if (!gymId) return DEFAULT_GYM_TIMEZONE;
      const { data } = await supabase.from("gyms").select("timezone").eq("id", gymId).maybeSingle();
      return data?.timezone ?? DEFAULT_GYM_TIMEZONE;
    },
    staleTime: Infinity,
  });
  return timeZone ? gymWallClock(new Date(), timeZone).date : null;
}
