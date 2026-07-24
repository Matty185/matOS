"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAthleteProfileData, type ProfileSubject } from "@/lib/analysis/fetch-profile-data";

export type { ProfileSubject };

export function useAthleteProfile(subject: ProfileSubject) {
  return useQuery({
    queryKey: ["athlete-profile", subject.type, subject.id],
    queryFn: async () => {
      const supabase = createClient();
      return fetchAthleteProfileData(supabase, subject);
    },
  });
}
