import { useQuery } from "@tanstack/react-query";
import { fetchAthleteProfileData, type ProfileSubject } from "@matos/shared";
import { supabase } from "@/lib/supabase";

// RN port of apps/web's lib/analysis/use-athlete-profile.ts — same
// fetchAthleteProfileData call, same query key shape, no options object
// (mobile's `supabase` client respects RLS exactly like web's own
// RLS-respecting client; `publicVisibilityOnly` is only for the
// service-role public share resolution path, web-only).
//
// `enabled` (not present on web's version): web's CompareView only
// mounts once its own subjectA/subjectB validation passes, so its two
// useAthleteProfile calls never fire for an invalid pair. Mobile's
// compare.tsx has to call hooks unconditionally (rules of hooks) even
// before its equivalent validity check, so a malformed/hand-edited deep
// link would otherwise still fire two real fetchAthleteProfileData calls
// with a placeholder empty-string id before the screen bails out (Stage
// M5 gate fix, database-reviewer) — harmless to RLS/security, just
// wasted requests. Defaults to true so every other existing call site is
// unaffected.
export function useAthleteProfile(subject: ProfileSubject, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["athlete-profile", subject.type, subject.id],
    queryFn: async () => fetchAthleteProfileData(supabase, subject),
    enabled: options.enabled ?? true,
  });
}
