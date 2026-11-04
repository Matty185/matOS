import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";
import { isBillable } from "@/lib/payments/overdue";

// Flow audit 6.7 + 8.3: what a member's plan says they pay each month, with
// the gym's sibling discount. Guidance for recording payments only — the
// payment dialog pre-fills it and bulk mark-paid stores it; nothing is
// charged (payment processing is out of scope).

type PlanKind = Database["public"]["Enums"]["membership_plan"];

export type GymPlan = {
  id: string;
  name: string;
  kind: PlanKind;
  price: number | null;
  active: boolean;
  sort_order: number;
};

type FeeMember = {
  id: string;
  role: string;
  membership_plan: string;
  plan_id: string | null;
  join_date: string;
  active: boolean;
};

type GuardianLink = { guardian_member_id: string; child_member_id: string };

export type FeeContext = {
  plans: Map<string, GymPlan>;
  discountPercent: number;
  /** Members who get the sibling discount (2nd and later child of a family). */
  discounted: Set<string>;
  members: Map<string, FeeMember>;
};

/** amount = what to record; base = the plan price before any discount. */
export type Fee = { amount: number; base: number; note: string };

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  monthly: "Monthly fee",
  comp_team: "Monthly fee (competition team)",
  casual: "Pay per class",
};

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(amount);
}

/**
 * The 2nd and later billable, active children of each family. A family is
 * every child connected through a shared parent account (so step-siblings
 * with one parent in common count). Oldest membership first (join date,
 * then id) keeps the full price; the rest get the discount.
 */
export function siblingDiscounted(members: FeeMember[], links: GuardianLink[]): Set<string> {
  const byId = new Map(members.map((m) => [m.id, m]));
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // Join every child of the same guardian.
  const firstChildOf = new Map<string, string>();
  for (const l of links) {
    if (!parent.has(l.child_member_id)) parent.set(l.child_member_id, l.child_member_id);
    const first = firstChildOf.get(l.guardian_member_id);
    if (first === undefined) firstChildOf.set(l.guardian_member_id, l.child_member_id);
    else union(first, l.child_member_id);
  }
  const families = new Map<string, FeeMember[]>();
  for (const childId of Array.from(parent.keys())) {
    const m = byId.get(childId);
    if (!m || !m.active || !isBillable(m)) continue;
    const root = find(childId);
    const list = families.get(root) ?? [];
    list.push(m);
    families.set(root, list);
  }
  const out = new Set<string>();
  for (const list of Array.from(families.values())) {
    list.sort((a, b) =>
      a.join_date === b.join_date
        ? a.id.localeCompare(b.id)
        : a.join_date.localeCompare(b.join_date),
    );
    for (const m of list.slice(1)) out.add(m.id);
  }
  return out;
}

/** The monthly fee for a member, or null when it isn't known. */
export function monthlyFee(ctx: FeeContext, memberId: string): Fee | null {
  const m = ctx.members.get(memberId);
  if (!m || !isBillable(m) || !m.plan_id) return null;
  const plan = ctx.plans.get(m.plan_id);
  if (!plan || plan.price === null || plan.kind === "casual") return null;
  if (ctx.discounted.has(memberId) && ctx.discountPercent > 0) {
    const amount = Math.round(plan.price * (100 - ctx.discountPercent)) / 100;
    return {
      amount,
      base: plan.price,
      note: `${plan.name}: ${formatMoney(plan.price)} less ${ctx.discountPercent}% sibling discount`,
    };
  }
  return { amount: plan.price, base: plan.price, note: `${plan.name}: ${formatMoney(plan.price)}` };
}

/**
 * Loads what monthlyFee needs for the caller's gym, under their RLS (staff
 * read every member and link in their gym). `gymId` is the caller's own;
 * in the browser it's resolved from current_member() (an account can see
 * several gyms rows).
 */
export async function loadFeeContext(
  supabase: SupabaseClient<Database>,
  gymId?: string,
): Promise<FeeContext> {
  if (!gymId) {
    const { data } = await supabase.rpc("current_member");
    gymId = (data as { gym_id: string }[] | null)?.[0]?.gym_id;
    if (!gymId)
      return { plans: new Map(), discountPercent: 0, discounted: new Set(), members: new Map() };
  }
  const [gymRes, planRes, memberRes, linkRes] = await Promise.all([
    supabase.from("gyms").select("sibling_discount_percent").eq("id", gymId).maybeSingle(),
    supabase
      .from("gym_plans")
      .select("id, name, kind, price, active, sort_order")
      .eq("gym_id", gymId),
    supabase
      .from("members")
      .select("id, role, membership_plan, plan_id, join_date, active")
      .eq("gym_id", gymId),
    supabase
      .from("member_guardians")
      .select("guardian_member_id, child_member_id")
      .eq("gym_id", gymId),
  ]);
  const members = memberRes.data ?? [];
  return {
    plans: new Map(
      (planRes.data ?? []).map((p) => [
        p.id,
        { ...p, price: p.price === null ? null : Number(p.price) },
      ]),
    ),
    discountPercent: gymRes.data?.sibling_discount_percent ?? 0,
    discounted: siblingDiscounted(members, linkRes.data ?? []),
    members: new Map(members.map((m) => [m.id, m])),
  };
}
