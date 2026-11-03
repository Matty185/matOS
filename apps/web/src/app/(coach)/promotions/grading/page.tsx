import { computeReadiness } from "@matos/shared";
import { createClient } from "@/lib/supabase/server";
import { fetchPromotionProgress, fetchPromotionRule } from "@/lib/promotions/readiness";
import { GradingDay, type GradingRow } from "@/components/shared/grading-day";

// Flow audit 5.4: grading day — promote several members at once. Same
// members and readiness as the Promotions page; each row starts on the
// member's suggested next rank (or their next stripe).
export default async function GradingDayPage() {
  const supabase = createClient();
  const [{ data: members, error }, rule, progress] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, belt, stripes")
      .eq("active", true)
      .neq("role", "guardian")
      .order("first_name"),
    fetchPromotionRule(supabase),
    fetchPromotionProgress(supabase).catch(() => new Map()),
  ]);
  if (error) throw error;
  const now = new Date();
  const rows: GradingRow[] = (members ?? []).map((m) => {
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
    const suggested =
      readiness.suggested ??
      (m.stripes < 4
        ? { belt: m.belt, stripes: m.stripes + 1 }
        : { belt: m.belt, stripes: m.stripes });
    return {
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      belt: m.belt,
      stripes: m.stripes,
      ready: readiness.status === "ready",
      suggested,
    };
  });

  return <GradingDay rows={rows} />;
}
