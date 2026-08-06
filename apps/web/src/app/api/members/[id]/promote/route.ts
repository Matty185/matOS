import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { sendPushToMember } from "@/lib/push/send-push";
import { promoteBeltSchema, BELT_LABELS } from "@matos/shared";

// POST /api/members/[id]/promote — coach/owner only. Updates the member's
// current belt/stripes AND inserts a belt_history row in the same request,
// per plan §7 ("select belt/stripes, notes, confirm -> updates member +
// history + audit"). Two sequential writes rather than a DB transaction
// (supabase-js has no client-side transaction API) — acceptable for alpha
// scope; a failure between them would leave the member's current belt
// updated but no history row, logged loudly rather than silently.
export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");
    const supabase = createClient();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("belt, stripes")
      .eq("id", id)
      .single();

    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your gym.");
    }

    const { error: updateError } = await supabase
      .from("members")
      .update({ belt: input.belt, stripes: input.stripes })
      .eq("id", id);

    if (updateError) {
      return apiError(500, "PROMOTE_FAILED", "Something went wrong — the promotion wasn't saved.");
    }

    const { error: historyError } = await supabase.from("belt_history").insert({
      member_id: id,
      // Overwritten server-side by the derive_gym_id_from_member trigger
      // (Stage 1) regardless of what's passed — the column is NOT NULL with
      // no default, so the generated Insert type still requires a value.
      gym_id: context.gymId,
      belt: input.belt,
      stripes: input.stripes,
      promoted_by: context.userId,
      notes: input.notes || null,
    });

    if (historyError) {
      console.error("[promote] member.belt updated but belt_history insert failed", historyError);
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.promoted",
      entityType: "members",
      entityId: id,
      beforeState: { belt: member.belt, stripes: member.stripes },
      afterState: { belt: input.belt, stripes: input.stripes },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    const stripeLabel =
      input.stripes > 0 ? `, ${input.stripes} stripe${input.stripes === 1 ? "" : "s"}` : "";
    await sendPushToMember(id, {
      title: "Belt promotion!",
      body: `You've been promoted to ${BELT_LABELS[input.belt]} belt${stripeLabel}.`,
      data: { type: "belt_promotion", memberId: id },
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: promoteBeltSchema },
);
