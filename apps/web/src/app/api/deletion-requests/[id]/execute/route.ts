import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";
import { isLastActiveOwner, LAST_OWNER_MESSAGE } from "@/lib/api/member-guards";

// POST /api/deletion-requests/[id]/execute — gym_owner only (Gym Settings is
// owner-only per plan §7's "Gym settings (owner)"). Executes plan §7's GDPR
// deletion flow: "member anonymised ('Deleted Member', email cleared,
// user_id unlinked), attendance/logs/analyses deleted, payments retained
// anonymised, audit retained with actor anonymised." — "analyses" here now
// means Match Analysis Module breakdowns (Non-Negotiable #10), the alpha
// stub `analyses` table this originally referred to was retired at Stage A7.
//
// Service-role for the anonymisation writes themselves — not a workaround,
// the intended design per Stage 1's own comment on deletion_requests RLS:
// "The anonymisation itself... is a Stage 2/8 service-role operation, not
// modelled here." No RLS DELETE policy exists on attendance/athlete_logs for
// authenticated users at all (CLAUDE.md Rule 6: "deletes are mostly
// disabled"), so an owner genuinely cannot perform steps (b)-(d) below
// through the RLS client even as the account owner — this flow is one of the
// few deliberate, narrow exceptions to that rule, not a bypass of it.
// (breakdowns DOES have an author-scoped delete policy, but that's the
// AUTHOR's own delete right, not the owner's GDPR-erasure right over their
// own data as FOCUS — a different actor and a different justification, so
// this still goes through service-role rather than relying on it.)
export const POST = withAuth(
  async (_request, context, _input, params) => {
    const requestId = params.id;
    if (!requestId) return apiError(400, "MISSING_ID", "No deletion request id provided.");

    const supabase = createClient();

    const { data: deletionRequest, error: fetchError } = await supabase
      .from("deletion_requests")
      .select("id, member_id, executed_at")
      .eq("id", requestId)
      .single();

    if (fetchError || !deletionRequest) {
      return apiError(404, "REQUEST_NOT_FOUND", "No deletion request found with that id.");
    }
    if (deletionRequest.executed_at) {
      return apiError(409, "ALREADY_EXECUTED", "This deletion request has already been executed.");
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, gym_id, user_id, first_name, last_name, email")
      .eq("id", deletionRequest.member_id)
      .single();

    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found for this deletion request.");
    }

    const serviceClient = createServiceRoleClient();

    // Stage O1: the members_last_owner_guard trigger rejects deactivating a
    // gym's sole active owner — and that update runs *after* the auth user
    // is irreversibly deleted below. Checked first, with the service client
    // (sees every owner row regardless of RLS), so this fails cleanly before
    // anything is touched instead of leaving an un-anonymisable member row.
    if (await isLastActiveOwner(serviceClient, member.id)) {
      return apiError(409, "LAST_OWNER", LAST_OWNER_MESSAGE);
    }

    const anonymizedEmail = `deleted-${member.id}@anonymized.invalid`;

    // Every step below is checked and aborts the whole request on failure —
    // security review found the original version discarded every result
    // after the first (Promise.all with no error checks, unchecked audit_log
    // update, unchecked deleteUser, unchecked deletion_requests update) and
    // unconditionally returned success regardless. That's a false assurance
    // of GDPR erasure: a partial failure could leave real PII (or even the
    // live, still-authenticatable account) intact while every visible signal
    // — toast, audit log, deletion_requests.executed_at — claimed it was
    // done. All operations here are naturally idempotent (deleting an
    // already-deleted row, re-nulling an already-null column, re-marking
    // executed_at), so on any failure this aborts before marking anything
    // "executed," and a retry is always safe.
    //
    // Stage 11 review found a subtler version of that same false-assurance
    // bug: the auth-user deletion below was gated on `member.user_id`, which
    // the members-anonymize step (further down) nulls. If a run got past
    // anonymizing the member but failed on a later step, a retry would
    // re-fetch `member` fresh, see `user_id` already null, and silently skip
    // ever deleting the real auth.users row — leaving a live, still-loggable
    // account behind while `deletion_requests` eventually reports success.
    // Fixed by deleting the auth user (and anonymizing the audit actor)
    // FIRST, while `member.user_id` is still guaranteed accurate, and only
    // then nulling it on the members row. A retry after the auth user is
    // already gone re-attempts `deleteUser` on that now-nonexistent id —
    // treated as success (idempotent), not a failure.
    const originalUserId = member.user_id;
    if (originalUserId) {
      // Audit rows where this member was the ACTOR (self check-ins, self-
      // service requests, etc.) get their actor anonymised — rows where they
      // were merely the ENTITY of a coach's action keep the coach as actor,
      // since that attribution is about the coach's action, not the member.
      const { error: auditAnonymizeError } = await serviceClient
        .from("audit_log")
        .update({ actor_id: null })
        .eq("actor_id", originalUserId);
      if (auditAnonymizeError) {
        console.error("[gdpr] failed to anonymize audit_log actor", auditAnonymizeError);
        return apiError(
          500,
          "DELETION_FAILED",
          "Something went wrong — the deletion wasn't completed. It's safe to retry.",
        );
      }

      const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(originalUserId);
      // "User not found" means a prior attempt already deleted it — safe to
      // treat as success rather than blocking the retry on it forever.
      if (deleteUserError && deleteUserError.status !== 404) {
        console.error("[gdpr] failed to delete auth user", deleteUserError);
        return apiError(
          500,
          "DELETION_FAILED",
          "Something went wrong — the deletion wasn't completed. It's safe to retry.",
        );
      }
    }

    const { error: anonymizeError } = await serviceClient
      .from("members")
      .update({
        first_name: "Deleted",
        last_name: "Member",
        email: anonymizedEmail,
        phone: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
        photo_url: null,
        notes: null,
        user_id: null,
        active: false,
      })
      .eq("id", member.id);

    if (anonymizeError) {
      console.error("[gdpr] failed to anonymize member row", anonymizeError);
      return apiError(
        500,
        "DELETION_FAILED",
        "Something went wrong — the deletion wasn't completed. It's safe to retry.",
      );
    }

    // breakdowns: Non-Negotiable #10 ("member deletion also deletes their
    // member-linked breakdowns") — hard-deletes every breakdown FOCUSED on
    // this member (member_id = them), which cascades to that breakdown's
    // positions/events automatically via the existing ON DELETE CASCADE FKs
    // (Stage A1 schema). Breakdowns this member merely AUTHORED about
    // someone else aren't touched here — those survive with author_id set
    // to null, handled entirely by the auth-user deletion above via
    // breakdowns.author_id's own ON DELETE SET NULL (Stage A1 review-fix),
    // the same graceful-orphan pattern already used for belt_history.
    // promoted_by. Deferred from Stage A1 itself (that migration's own
    // design note flagged this as app-code work for "whichever stage first
    // builds breakdown CRUD routes" — Stage A7).
    const [
      attendanceResult,
      logsResult,
      breakdownsResult,
      paymentsResult,
      beltHistoryResult,
      pushTokensResult,
      notificationsResult,
      classCoachResult,
      holdsResult,
      waiverResult,
      leadsByLinkResult,
      leadsByEmailResult,
    ] = await Promise.all([
      serviceClient.from("attendance").delete().eq("member_id", member.id),
      serviceClient.from("athlete_logs").delete().eq("member_id", member.id),
      serviceClient.from("breakdowns").delete().eq("member_id", member.id),
      serviceClient.from("payments").update({ notes: null }).eq("member_id", member.id),
      serviceClient.from("belt_history").update({ notes: null }).eq("member_id", member.id),
      // push_tokens (Stage M1) has an `on delete cascade` FK to members, but
      // this route anonymises the members row rather than deleting it (Rule
      // 6) — that FK never fires here, unlike delete-solo's hard-delete
      // path. Found by this stage's own review gate: without this, a
      // member's live device push token would silently survive a GDPR
      // erasure request untouched while everything else was cleaned up.
      serviceClient.from("push_tokens").delete().eq("member_id", member.id),
      // notifications (Stage M9 gate fix, database-reviewer): /api/account/
      // delete-request writes this member's real first/last name into a
      // coach's notifications.payload the moment they request deletion —
      // notifications.recipient_user_id cascades on the COACH's auth-user
      // deletion, not this member's, so that PII survives the anonymisation
      // above untouched and indefinitely unless swept here explicitly.
      serviceClient.from("notifications").delete().eq("payload->>member_id", member.id),
      // Flow audit 3.3: an erased coach stops being named as a class's coach.
      serviceClient
        .from("classes")
        .update({ coach_member_id: null })
        .eq("coach_member_id", member.id),
      // Flow audit 2.4: membership_holds cascades on member delete, but this
      // route anonymises the member instead, so the cascade never fires.
      serviceClient.from("membership_holds").delete().eq("member_id", member.id),
      // Flow audit 9.3: waiver signatures are kept (they show a waiver was
      // agreed, which the gym may need to show later) but the typed name,
      // the member's or a parent's, is cleared.
      serviceClient
        .from("waiver_signatures")
        .update({ signer_name: null })
        .eq("member_id", member.id),
      // Flow audit 9.1: the trial request they joined from (and any other
      // from their email in this gym) holds their name and contact details.
      // On a retry the email is already anonymised; the link still matches.
      serviceClient.from("trial_leads").delete().eq("converted_member_id", member.id),
      member.email && !/@anonymized\.invalid$/.test(member.email)
        ? serviceClient
            .from("trial_leads")
            .delete()
            .eq("gym_id", member.gym_id)
            // Leads store emails lowercased; an exact match (no wildcards).
            .eq("email", member.email.toLowerCase())
        : Promise.resolve({ error: null }),
    ]);

    for (const [label, result] of [
      ["attendance", attendanceResult],
      ["athlete_logs", logsResult],
      ["breakdowns", breakdownsResult],
      ["payments", paymentsResult],
      ["belt_history", beltHistoryResult],
      ["push_tokens", pushTokensResult],
      ["notifications", notificationsResult],
      ["classes.coach_member_id", classCoachResult],
      ["membership_holds", holdsResult],
      ["waiver_signatures", waiverResult],
      ["trial_leads (converted)", leadsByLinkResult],
      ["trial_leads (email)", leadsByEmailResult],
    ] as const) {
      if (result.error) {
        console.error(`[gdpr] failed to clean up ${label}`, result.error);
        return apiError(
          500,
          "DELETION_FAILED",
          "Something went wrong — the deletion wasn't completed. It's safe to retry.",
        );
      }
    }

    const { error: markExecutedError } = await serviceClient
      .from("deletion_requests")
      .update({ executed_at: new Date().toISOString(), executed_by: context.userId })
      .eq("id", requestId);

    if (markExecutedError) {
      console.error("[gdpr] failed to mark deletion_requests executed", markExecutedError);
      return apiError(
        500,
        "DELETION_FAILED",
        "Something went wrong — the deletion wasn't completed. It's safe to retry.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "gdpr.deletion_executed",
      entityType: "members",
      entityId: member.id,
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner" },
);
