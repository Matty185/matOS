import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PromotionRule } from "@matos/shared";

type Client = SupabaseClient<Database>;

/** "12 Mar 2026" in the gym's own zone — format on the server only, so the
 * label never depends on the viewer's device zone (hydration-safe). */
export function formatGymDate(instant: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(instant));
}

export type MemberProgress = {
  lastPromotedAt: string;
  lastIsInitial: boolean;
  classesSince: number;
};

/**
 * The caller's gym promotion guidance (flow audit 5.3). gyms_select_own RLS
 * returns only the current gym. Falls back to "off" if unreadable, so a
 * failed read never flags anyone as ready.
 */
export async function fetchPromotionRule(supabase: Client): Promise<PromotionRule> {
  const { data } = await supabase
    .from("gyms")
    .select("promotion_classes_per_stripe, promotion_months_per_stripe")
    .limit(1)
    .maybeSingle();
  return {
    classesPerStripe: data?.promotion_classes_per_stripe ?? null,
    monthsPerStripe: data?.promotion_months_per_stripe ?? null,
  };
}

/**
 * Last promotion + classes since, per active member, via the
 * promotion_progress RPC (SECURITY INVOKER — RLS decides who's included).
 * Pass a member id to fetch just one.
 */
export async function fetchPromotionProgress(
  supabase: Client,
  memberId?: string,
): Promise<Map<string, MemberProgress>> {
  const { data, error } = await supabase.rpc(
    "promotion_progress",
    memberId ? { p_member_id: memberId } : {},
  );
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.member_id,
      {
        lastPromotedAt: r.last_promoted_at,
        lastIsInitial: r.last_is_initial,
        classesSince: Number(r.classes_since),
      },
    ]),
  );
}
