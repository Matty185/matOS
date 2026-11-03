import type { SupabaseClient } from "@supabase/supabase-js";
import { BELT_LABELS, type BeltColor, type Database } from "@matos/shared";
import { writeAuditLog } from "@/lib/audit/log";
import { sendPushToMember } from "@/lib/push/send-push";

export type PromoteResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "MEMBER_NOT_FOUND"
        | "NOT_A_TRAINING_MEMBER"
        | "MEMBER_INACTIVE"
        | "NO_CHANGE"
        | "PROMOTE_FAILED";
    };

/**
 * One promotion: updates the member's current rank, adds a belt_history row,
 * writes the audit row and sends the push. Shared by the single promote
 * route and grading day (flow audit 5.4) so both behave identically. Runs
 * under the caller's RLS (staff of the member's gym).
 *
 * Two sequential writes, not a transaction (supabase-js has none) — a
 * failure between them leaves the current rank updated without a history
 * row, logged loudly (unchanged from the original route).
 */
export async function promoteMember(
  supabase: SupabaseClient<Database>,
  ctx: { gymId: string; userId: string },
  memberId: string,
  target: { belt: BeltColor; stripes: number; notes?: string | null },
  audit: { initiatedBy: "coach_manual" | "agent"; agentQuery: string | null; gradingDay?: boolean },
): Promise<PromoteResult> {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("belt, stripes, role, active")
    .eq("id", memberId)
    .single();
  if (memberError || !member) return { ok: false, code: "MEMBER_NOT_FOUND" };
  // Parent accounts (flow audit 8.2) don't hold a rank.
  if (member.role === "guardian") return { ok: false, code: "NOT_A_TRAINING_MEMBER" };
  if (!member.active) return { ok: false, code: "MEMBER_INACTIVE" };
  // Already at that rank: a double tap or a retry, not a promotion. Writing
  // it again would add a history row and reset their "since" clock.
  if (member.belt === target.belt && member.stripes === target.stripes) {
    return { ok: false, code: "NO_CHANGE" };
  }

  const { error: updateError } = await supabase
    .from("members")
    .update({ belt: target.belt, stripes: target.stripes })
    .eq("id", memberId);
  if (updateError) return { ok: false, code: "PROMOTE_FAILED" };

  const { error: historyError } = await supabase.from("belt_history").insert({
    member_id: memberId,
    // Overwritten by the derive_gym_id_from_member trigger.
    gym_id: ctx.gymId,
    belt: target.belt,
    stripes: target.stripes,
    promoted_by: ctx.userId,
    notes: target.notes || null,
  });
  if (historyError) {
    console.error("[promote] member.belt updated but belt_history insert failed", historyError);
  }

  await writeAuditLog({
    gymId: ctx.gymId,
    actorId: ctx.userId,
    action: "member.promoted",
    entityType: "members",
    entityId: memberId,
    beforeState: { belt: member.belt, stripes: member.stripes },
    afterState: {
      belt: target.belt,
      stripes: target.stripes,
      ...(audit.gradingDay ? { grading_day: true } : {}),
    },
    initiatedBy: audit.initiatedBy,
    agentQuery: audit.agentQuery,
  });

  const stripeLabel =
    target.stripes > 0 ? `, ${target.stripes} stripe${target.stripes === 1 ? "" : "s"}` : "";
  await sendPushToMember(memberId, {
    title: "Belt promotion!",
    body: `You've been promoted to ${BELT_LABELS[target.belt]} belt${stripeLabel}.`,
    data: { type: "belt_promotion", memberId },
  });

  return { ok: true };
}
