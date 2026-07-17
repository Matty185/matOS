import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["member_role"];

export type CurrentMember = {
  userId: string;
  memberId: string;
  gymId: string;
  role: Role;
  firstName: string;
  lastName: string;
};

/**
 * Server Component / layout equivalent of withAuth's session lookup —
 * middleware already guarantees a session exists for anything reaching a
 * page that uses this (everything except the public allowlist), so this
 * returns null only for the edge case of a session whose member row is
 * missing or deactivated (RLS's `active` check, Stage 2, makes the query
 * simply return nothing rather than erroring).
 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: member } = await supabase
    .from("members")
    .select("id, gym_id, role, first_name, last_name")
    .eq("user_id", user.id)
    .single();

  if (!member) return null;

  return {
    userId: user.id,
    memberId: member.id,
    gymId: member.gym_id,
    role: member.role,
    firstName: member.first_name,
    lastName: member.last_name,
  };
}
