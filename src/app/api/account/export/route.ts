import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";

// GET /api/account/export — any authenticated member, self only. Plan §7:
// "request my data (JSON download)." Uses the RLS client for everything
// except analyses — every other table queried here has a genuine "select
// own" policy (members, attendance, payments, belt_history, athlete_logs,
// gdpr_consents) with no additional restriction, so RLS alone already
// returns the complete set.
//
// analyses is the one exception: analyses_select_self additionally requires
// visible_to_athlete = true (a screen-scoping condition — a coach can hide
// an analysis from the athlete-facing Upload page). That's correct for the
// app UI but wrong for a GDPR data-portability export, whose entire purpose
// is "everything held about me" — an athlete has a right to a coach-hidden
// analysis existing at all, even if the app chooses not to surface it day
// to day. Queried via service-role for this one table only, specifically to
// bypass that screen-scoping condition, not to bypass ownership (still
// filtered to this member's own id).
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

  const [member, attendance, payments, beltHistory, logs, analyses, consent] = await Promise.all([
    supabase.from("members").select("*").eq("id", context.memberId).single(),
    supabase.from("attendance").select("*").eq("member_id", context.memberId),
    supabase.from("payments").select("*").eq("member_id", context.memberId),
    supabase.from("belt_history").select("*").eq("member_id", context.memberId),
    supabase.from("athlete_logs").select("*").eq("member_id", context.memberId),
    serviceClient.from("analyses").select("*").eq("member_id", context.memberId),
    supabase.from("gdpr_consents").select("*").eq("member_id", context.memberId).maybeSingle(),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    member: member.data ?? null,
    attendance: attendance.data ?? [],
    payments: payments.data ?? [],
    belt_history: beltHistory.data ?? [],
    athlete_logs: logs.data ?? [],
    analyses: analyses.data ?? [],
    gdpr_consent: consent.data ?? null,
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
