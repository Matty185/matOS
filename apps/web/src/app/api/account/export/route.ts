import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";

// GET /api/account/export — any authenticated member, self only. Plan §7:
// "request my data (JSON download)." Uses the RLS client for everything
// except breakdowns — every other table queried here has a genuine "select
// own" policy (members, attendance, payments, belt_history, athlete_logs,
// gdpr_consents) with no additional restriction, so RLS alone already
// returns the complete set.
//
// breakdowns is the one exception: breakdowns_all_own additionally requires
// author_id = self (an authorship-scoping condition — a coach can log a
// breakdown ABOUT this member without the member ever authoring or seeing
// it). That's correct for the app UI (plan §7's ownership model) but wrong
// for a GDPR data-portability export, whose entire purpose is "everything
// held about me" — an athlete has a right to a coach-authored breakdown
// about them existing at all, even if RLS wouldn't otherwise let them read
// it day to day. Queried via service-role for this table (and its child
// breakdown_positions/breakdown_events, joined by breakdown_id) specifically
// to bypass that authorship-scoping condition, not to bypass the member_id
// (focus) ownership filter — still scoped to this member's own id. Same
// reasoning the alpha stub's now-retired `analyses` export exception used
// (Stage A7 carries the pattern forward, not the table).
//
// Deliberately includes payments.amount even though CLAUDE.md Rule 3 hides
// amount from athlete-facing app *screens* — that rule is about the everyday
// UI (Payments-adjacent views shouldn't show a dollar figure to an athlete
// scanning the app), not about a GDPR data-portability export, which exists
// specifically to hand the person everything held about them, amounts
// included. This route is a distinct, deliberate export path, not a UI
// screen the amount-hiding rule was written to cover.
export const GET = withAuth(async (_request, context) => {
  const supabase = createClient();
  const serviceClient = createServiceRoleClient();

  const [
    member,
    attendance,
    payments,
    beltHistory,
    logs,
    breakdowns,
    consent,
    pushTokens,
    memberships,
    entitlements,
    shareLinks,
    holds,
  ] = await Promise.all([
    supabase.from("members").select("*").eq("id", context.memberId).single(),
    supabase.from("attendance").select("*").eq("member_id", context.memberId),
    supabase.from("payments").select("*").eq("member_id", context.memberId),
    supabase.from("belt_history").select("*").eq("member_id", context.memberId),
    supabase.from("athlete_logs").select("*").eq("member_id", context.memberId),
    serviceClient.from("breakdowns").select("*").eq("member_id", context.memberId),
    supabase.from("gdpr_consents").select("*").eq("member_id", context.memberId).maybeSingle(),
    // push_tokens (Stage M1) — RLS client is sufficient (push_tokens_all_self
    // already scopes to self, no authorship-style restriction like breakdowns has).
    supabase.from("push_tokens").select("*").eq("member_id", context.memberId),
    // memberships/entitlements/share_links (Stage M9 gate fix, database-
    // reviewer): all three are genuine "data held about me," all three key
    // by user_id (not member_id — Stage S1's account-primary schema, unlike
    // every table above), and all three already have a self-scoped select
    // policy (memberships_select_own, entitlements_select_own,
    // share_links_all_own) — RLS client is sufficient, no service-role
    // authorship-scoping gap like breakdowns has.
    supabase.from("memberships").select("*").eq("user_id", context.userId),
    supabase.from("entitlements").select("*").eq("user_id", context.userId),
    supabase.from("share_links").select("*").eq("created_by", context.userId),
    // Flow audit 2.4 (membership_holds_select_self).
    supabase.from("membership_holds").select("*").eq("member_id", context.memberId),
  ]);

  const breakdownIds = (breakdowns.data ?? []).map((b) => b.id);
  const [breakdownPositions, breakdownEvents] =
    breakdownIds.length === 0
      ? [{ data: [] }, { data: [] }]
      : await Promise.all([
          serviceClient.from("breakdown_positions").select("*").in("breakdown_id", breakdownIds),
          serviceClient.from("breakdown_events").select("*").in("breakdown_id", breakdownIds),
        ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    member: member.data ?? null,
    attendance: attendance.data ?? [],
    payments: payments.data ?? [],
    belt_history: beltHistory.data ?? [],
    athlete_logs: logs.data ?? [],
    breakdowns: breakdowns.data ?? [],
    breakdown_positions: breakdownPositions.data ?? [],
    breakdown_events: breakdownEvents.data ?? [],
    gdpr_consent: consent.data ?? null,
    push_tokens: pushTokens.data ?? [],
    memberships: memberships.data ?? [],
    entitlements: entitlements.data ?? [],
    share_links: shareLinks.data ?? [],
    membership_holds: holds.data ?? [],
  };

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "member.data_exported",
    entityType: "members",
    entityId: context.memberId,
    initiatedBy: "self_service",
  });

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="matos-my-data-${context.memberId}.json"`,
    },
  });
});
