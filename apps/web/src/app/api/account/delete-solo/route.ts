import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { withAuth } from "@/lib/auth/withAuth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";

// POST /api/account/delete-solo — self-serve, immediate account deletion
// for solo (personal-workspace-only) users, per matos_mobile_plan.md §2.3
// ("Apple requirement + GDPR") and the confirmed S2 scope decision:
// restricted to accounts whose *every* active membership is a personal
// workspace. A user who also belongs to a real gym is rejected here —
// their gym-context data still goes through the existing coach-approved
// anonymisation flow (api/account/delete-request +
// api/deletion-requests/[id]/execute), which this route never touches or
// bypasses.
//
// IMPORTANT — this does NOT literally "hard-delete the personal gyms row"
// despite the plan's own wording, because it cannot: `audit_log.gym_id`
// is `not null references gyms(id) on delete restrict`, and audit_log is
// immutable by design (CLAUDE.md Rule 6, enforced by a trigger that blocks
// DELETE even for the service-role client) — and a personal workspace
// always has at least one audit_log row (the signup itself). Deleting the
// gyms row is therefore not just against policy, it is a foreign-key
// impossibility under this schema's own invariants. What this route
// actually does, matching the same anonymise-not-delete precedent the
// existing GDPR execute route already established for `members`: hard-
// deletes everything that genuinely has no such constraint (breakdowns +
// their positions/events, the gdpr_consents record, the members row, the
// auth.users row itself), and anonymises the gyms row in place — which is
// what makes the account, and everything a login could ever reach again,
// actually gone, even though one inert, unidentifiable gym row remains
// for audit_log's FK to keep pointing at.
export const POST = withAuth(async (_request, context) => {
  const supabase = createServiceRoleClient();

  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("gym_id, gyms(kind)")
    .eq("user_id", context.userId)
    .eq("active", true);

  if (membershipsError) {
    console.error("[delete-solo] failed to read memberships", membershipsError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
  }

  const hasRealGymMembership = memberships?.some((m) => m.gyms?.kind === "gym");
  if (hasRealGymMembership) {
    return apiError(
      409,
      "HAS_GYM_MEMBERSHIP",
      "You also belong to a gym. Account deletion for gym members goes through your coach's request flow.",
    );
  }

  const personalGymId = context.gymId;

  const { error: breakdownsError } = await supabase
    .from("breakdowns")
    .delete()
    .eq("author_id", context.userId)
    .eq("gym_id", personalGymId);

  if (breakdownsError) {
    console.error("[delete-solo] failed to delete breakdowns", breakdownsError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
  }

  // `members.id` has `on delete restrict` FKs from six more tables
  // (belt_history, attendance, payments, athlete_logs, invites,
  // deletion_requests) beyond breakdowns/gdpr_consents — a database-
  // reviewer finding: none of these are gated against a personal
  // workspace at the API layer (e.g. POST /api/payments/record,
  // /api/members/[id]/promote, /api/logs all accept a gym_owner-role
  // caller, which a solo signup grants), so any of them could genuinely
  // exist for this member and would otherwise abort the `members` delete
  // below partway through — after breakdowns/gdpr_consents were already
  // gone, with no rollback. A personal workspace has no "gym business
  // records" to preserve the way the coach-executed anonymisation route
  // does (that route keeps payments/belt_history rows deliberately, for
  // a real gym's records) — this is the user's own self-tracked data in
  // their own now-deleted workspace, so hard-deleting it here matches
  // the plan's "personal workspace and all contents" intent rather than
  // needing an anonymise-in-place variant.
  for (const table of [
    "belt_history",
    "attendance",
    "payments",
    "athlete_logs",
    "invites",
    "deletion_requests",
    // Flow audit 2.4: would cascade with the members row; explicit to match
    // this sweep rather than rely on the FK.
    "membership_holds",
  ] as const) {
    const { error } = await supabase.from(table).delete().eq("member_id", context.memberId);
    if (error) {
      console.error(`[delete-solo] failed to delete ${table}`, error);
      return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
    }
  }

  // Flow audit 7.1: the route refuses announcements in personal
  // workspaces, but RLS would let the workspace owner insert one directly.
  // Clear any so their text doesn't outlive the workspace.
  const { error: announcementsError } = await supabase
    .from("announcements")
    .delete()
    .eq("gym_id", personalGymId);
  if (announcementsError) {
    console.error("[delete-solo] failed to delete announcements", announcementsError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
  }

  const { error: consentError } = await supabase
    .from("gdpr_consents")
    .delete()
    .eq("member_id", context.memberId);

  if (consentError) {
    console.error("[delete-solo] failed to delete gdpr_consents", consentError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
  }

  const { error: memberError } = await supabase.from("members").delete().eq("id", context.memberId);

  if (memberError) {
    console.error("[delete-solo] failed to delete member row", memberError);
    return apiError(500, "INTERNAL_ERROR", "Something went wrong — nothing was deleted.");
  }

  const { error: gymAnonymiseError } = await supabase
    .from("gyms")
    .update({
      name: "Deleted Workspace",
      contact_email: null,
      address: null,
      logo_url: null,
      active: false,
    })
    .eq("id", personalGymId);

  if (gymAnonymiseError) {
    console.error("[delete-solo] failed to anonymise gym row", gymAnonymiseError);
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Something went wrong — the account wasn't fully deleted.",
    );
  }

  // Written before deleting the auth user below: audit_log.actor_id must
  // reference a real row at insert time (it's ON DELETE SET NULL, not
  // restrict, but only once a row already exists to later null out).
  await writeAuditLog({
    gymId: personalGymId,
    actorId: context.userId,
    action: "account.self_deleted",
    entityType: "members",
    entityId: context.memberId,
    initiatedBy: "self_service",
  });

  // Last step, deliberately, even though it's no longer FK-enforced:
  // breakdowns.author_id was `on delete restrict` when this route was
  // first written, but 20260723190000 relaxed it to `on delete set null`
  // (so a departed coach's authored breakdowns don't become permanently
  // undeletable) — a breakdown missed by the delete above would now be
  // silently orphaned rather than blocking this step. Kept last anyway:
  // deleting the auth user is the one truly irreversible action here, so
  // every other cleanup should have already succeeded first regardless of
  // whether the schema still enforces that ordering for us.
  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(context.userId);

  if (deleteUserError && !deleteUserError.message?.toLowerCase().includes("not found")) {
    console.error("[delete-solo] failed to delete auth user", deleteUserError);
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Your data was deleted but your login couldn't be removed. Contact support.",
    );
  }

  return NextResponse.json({ success: true });
});
