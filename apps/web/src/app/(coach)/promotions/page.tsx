import { computeReadiness } from "@matos/shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/current-member";
import {
  fetchPromotionProgress,
  fetchPromotionRule,
  formatGymDate,
  type MemberProgress,
} from "@/lib/promotions/readiness";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { DEFAULT_GYM_TIMEZONE } from "@matos/shared";
import { PromotionsList, type PromotionRow } from "@/components/shared/promotions-list";

// Flow audit 5.3: who's due a stripe or belt. Guidance from the gym's
// classes/months-per-stripe rule; coaches promote from here directly.
export default async function PromotionsPage() {
  const supabase = createClient();
  const viewer = await getCurrentMember();

  const [{ data: members, error }, rule, progressResult, timeZone] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, belt, stripes, role")
      .eq("active", true)
      .order("first_name"),
    fetchPromotionRule(supabase),
    fetchPromotionProgress(supabase).then(
      (map) => ({ ok: true as const, map }),
      (e: unknown) => {
        console.error("[promotions] progress failed", e);
        return { ok: false as const, map: new Map<string, MemberProgress>() };
      },
    ),
    viewer ? getGymTimeZone(supabase, viewer.gymId) : Promise.resolve(DEFAULT_GYM_TIMEZONE),
  ]);
  if (error) throw error;
  const progress = progressResult.map;

  const now = new Date();
  const rows: PromotionRow[] = (members ?? []).map((m) => {
    const p = progress.get(m.id);
    const readiness = computeReadiness({
      belt: m.belt,
      stripes: m.stripes,
      lastPromotedAt: p?.lastPromotedAt ?? now,
      lastIsInitial: p?.lastIsInitial ?? true,
      classesSince: p?.classesSince ?? 0,
      rule,
      now,
    });
    return {
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      belt: m.belt,
      stripes: m.stripes,
      isStaff: m.role !== "athlete",
      sinceLabel: p ? formatGymDate(p.lastPromotedAt, timeZone) : null,
      lastIsInitial: p?.lastIsInitial ?? true,
      readiness,
    };
  });

  return (
    <PromotionsList
      rows={rows}
      rule={rule}
      canEditRule={viewer?.role === "gym_owner"}
      loadFailed={!progressResult.ok}
    />
  );
}
