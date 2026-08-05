import { useQuery } from "@tanstack/react-query";
import type { Database } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

type Role = Database["public"]["Enums"]["member_role"];
type GymKind = Database["public"]["Enums"]["gym_kind"];

export type CurrentMember = {
  userId: string;
  memberId: string;
  gymId: string;
  gymKind: GymKind;
  role: Role;
  firstName: string;
  lastName: string;
};

// Client-side (TanStack Query) equivalent of apps/web's server-only
// getCurrentMember() — same public.current_member() RPC (Stage S2), same
// reason for using it over a direct `.eq("user_id", ...)` query (an
// account can hold more than one members row since Stage S1, which makes
// that ambiguous). Every M1 screen that needs to know memberId/gymId/
// gymKind should use this rather than re-deriving it.
export function useCurrentMember() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ["current-member", session?.user.id],
    queryFn: async (): Promise<CurrentMember | null> => {
      const { data: members } = await supabase.rpc("current_member");
      const member = members?.[0];
      if (!member || !session) return null;
      return {
        userId: session.user.id,
        memberId: member.id,
        gymId: member.gym_id,
        gymKind: member.gym_kind,
        role: member.role,
        firstName: member.first_name,
        lastName: member.last_name,
      };
    },
    enabled: !!session,
    // memberId/gymId/gymKind only change on an explicit gym switch or
    // re-login, not on a timer — without this, every screen that mounts
    // this hook independently (Home, Check-in, Progress, Account, plus
    // the tab layout for push registration) triggers its own redundant
    // current_member() round-trip the instant it mounts, since the
    // default staleTime of 0 means the _layout.tsx's own call from
    // moments earlier is already considered stale.
    staleTime: 5 * 60 * 1000,
  });
}
