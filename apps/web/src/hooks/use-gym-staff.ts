"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export type StaffMember = {
  id: string;
  first_name: string;
  last_name: string;
  role: "coach" | "gym_owner";
  active: boolean;
};

/**
 * Flow audit 3.3: the gym's coaches and owners, inactive ones included so a
 * class still assigned to someone who left shows their name. Staff-only
 * (members RLS); athletes resolve coach names via class_coach_names().
 */
export function useGymStaff() {
  return useQuery({
    queryKey: ["gym-staff"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, role, active")
        .in("role", ["coach", "gym_owner"])
        .order("first_name");
      if (error) throw error;
      return data as StaffMember[];
    },
    // Refetched on every mount: a coach added moments ago (setup wizard,
    // Settings → Team) should be pickable straight away.
    staleTime: 0,
  });
}
