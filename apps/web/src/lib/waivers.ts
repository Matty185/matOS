import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

// Flow audit 9.3: liability waivers. The gym's current waiver is its highest
// published version; a member is covered when they have a signature for that
// version. Athletes sign; coaches and owners (staff, who train free and
// have no athlete pages) don't need to. Unsigned members are flagged, never blocked.

export type CurrentWaiver = { id: string; version: number; body: string; created_at: string };

export type WaiverSignatureMethod = Database["public"]["Enums"]["waiver_signature_method"];

/** The caller's gym's current waiver (RLS: waiver_versions_select_gym), or null. */
export async function fetchCurrentWaiver(
  supabase: SupabaseClient<Database>,
): Promise<CurrentWaiver | null> {
  const { data, error } = await supabase
    .from("waiver_versions")
    .select("id, version, body, created_at")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Ids of members with a live (not voided) signature for this version
 * (staff: whole gym; athlete: self).
 */
export async function fetchSignedMemberIds(
  supabase: SupabaseClient<Database>,
  waiverVersionId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("waiver_signatures")
    .select("member_id")
    .eq("waiver_version_id", waiverVersionId)
    .is("voided_at", null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.member_id));
}

/** Who has to sign: athletes. Staff are exempt (as from monthly fees). */
export function needsWaiver(member: { role: string }): boolean {
  return member.role === "athlete";
}

export const WAIVER_METHOD_LABELS: Record<WaiverSignatureMethod, string> = {
  self: "Signed in the app",
  guardian: "Signed by parent or guardian",
  paper: "Paper waiver on file",
};
