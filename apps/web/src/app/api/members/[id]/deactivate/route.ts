import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { mapMemberGuardError } from "@/lib/api/member-guards";
import { deactivateMemberSchema } from "@matos/shared";

// POST /api/members/[id]/deactivate — coach/owner only. Sets active=false;
// members are deactivated, never hard-deleted, per CLAUDE.md Rule 6. The
// `confirm: true` body requirement backs the UI's own confirmation dialog
// with a real server-side check — the typed "yes"/"confirm" requirement in
// CLAUDE.md is specifically for the agent's deactivate_member tool call
// (Agentic Interface Rules), not this direct dashboard action, which uses a
// standard confirm-dialog pattern instead.
//
// Security review found that the typed text itself was never actually sent
// to (or checked by) the server — the agent-chat client only gated its
// Confirm *button* on the typed input matching /^(yes|confirm)$/i, then
// sent the same static {confirm:true} regardless of what was typed or
// whether anything was typed at all, fully bypassable by calling this
// endpoint directly. `typed_confirmation` now carries the literal string
// the coach typed; for agent-initiated calls (identified by agent_query
// being present, same signal every other write endpoint already uses to
// distinguish agent vs. direct-UI origin) it's independently re-validated
// here, server-side.
const TYPED_CONFIRMATION_PATTERN = /^(yes|confirm)$/i;

export const POST = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No member id provided.");

    if (
      input.agent_query &&
      !TYPED_CONFIRMATION_PATTERN.test((input.typed_confirmation ?? "").trim())
    ) {
      return apiError(
        400,
        "TYPED_CONFIRMATION_REQUIRED",
        'Deactivating a member via the assistant requires typing "yes" or "confirm".',
      );
    }

    const supabase = createClient();

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("active, first_name, last_name")
      .eq("id", id)
      .single();

    if (memberError || !member) {
      return apiError(404, "MEMBER_NOT_FOUND", "No member found with that id in your academy.");
    }

    if (!member.active) {
      return apiError(409, "ALREADY_INACTIVE", "This member is already deactivated.");
    }

    // .eq("active", true) makes this a conditional (atomic) update rather
    // than the earlier read-then-write — found in Stage 4 security review:
    // two concurrent deactivate requests could otherwise both pass the
    // check above and both "succeed," producing two permanent audit_log
    // entries for one logical event. Zero affected rows here means someone
    // else's concurrent request already won; treat that the same as the
    // already-inactive case rather than as a server error.
    const { data: updated, error: updateError } = await supabase
      .from("members")
      .update({ active: false })
      .eq("id", id)
      .eq("active", true)
      .select("id");

    if (updateError) {
      // Stage O1 DB guards: last active owner (409), coach acting on a
      // staff row (403).
      const mapped = mapMemberGuardError(updateError);
      if (mapped) return mapped;
      return apiError(500, "DEACTIVATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    if (!updated || updated.length === 0) {
      return apiError(409, "ALREADY_INACTIVE", "This member is already deactivated.");
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.deactivated",
      entityType: "members",
      entityId: id,
      beforeState: { active: true },
      afterState: { active: false },
      // Extra audit detail for this action per CLAUDE.md's agentic-interface
      // rules ("deactivate_member requires typed confirmation... extra audit
      // detail") — the raw NL query is the extra detail; the typed "yes"/
      // "confirm" itself is enforced client-side before this request is ever
      // sent, backed by this schema's own confirm:true requirement.
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: deactivateMemberSchema },
);
