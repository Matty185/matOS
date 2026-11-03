import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog, writeAuditLogStrict } from "@/lib/audit/log";
import { updateTrialLeadSchema } from "@matos/shared";

// Flow audit 9.1: coaches work through trial requests. RLS
// (trial_leads_*_staff) scopes everything to the caller's gym; the table's
// column grant and guard let only status, notes and the converted member
// change.

// PATCH /api/trial-leads/[id] — status, notes, or conversion. Converting
// needs a member of this gym (the guard trigger checks that too).
export const PATCH = withAuth(
  async (_request: NextRequest, context, input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No trial request id provided.");
    const supabase = createClient();

    const { data: lead } = await supabase
      .from("trial_leads")
      .select("id, status, converted_member_id")
      .eq("id", id)
      .maybeSingle();
    if (!lead) return apiError(404, "NOT_FOUND", "That trial request wasn't found.");

    const patch: {
      status?: typeof lead.status;
      coach_notes?: string | null;
      converted_member_id?: string;
    } = {};
    if (input.status !== undefined) patch.status = input.status;
    if (input.coach_notes !== undefined) patch.coach_notes = input.coach_notes || null;
    // "Joined" only ever comes with the member it became (Add as member).
    if (input.status === "converted" && input.converted_member_id === undefined) {
      return apiError(400, "MEMBER_REQUIRED", "Use Add as member to mark someone as joined.");
    }
    if (input.converted_member_id !== undefined) {
      patch.converted_member_id = input.converted_member_id;
      patch.status = "converted";
    }
    // A lead linked to a member stays "Joined" (the DB enforces it too).
    if (lead.converted_member_id && patch.status && patch.status !== "converted") {
      return apiError(
        409,
        "LEAD_CONVERTED",
        "This person has already joined as a member, so the status can't change.",
      );
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ success: true });

    const { data: updated, error } = await supabase
      .from("trial_leads")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error?.code === "22023") {
      return apiError(400, "INVALID_MEMBER", "That member isn't in your gym.");
    }
    if (error || !updated || updated.length === 0) {
      console.error("[trial-leads] update failed", error?.code);
      return apiError(500, "LEAD_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    // Status/notes changes are routine bookkeeping: best effort. Notes text
    // is not copied into the audit row.
    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: patch.converted_member_id ? "trial.converted" : "trial.updated",
      entityType: "trial_leads",
      entityId: id,
      beforeState: { status: lead.status },
      afterState: {
        status: patch.status ?? lead.status,
        notes_changed: input.coach_notes !== undefined,
        ...(patch.converted_member_id ? { member_id: patch.converted_member_id } : {}),
      },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: updateTrialLeadSchema },
);

// DELETE /api/trial-leads/[id] — e.g. the person asked to be forgotten, or
// spam. Audit-first, fail-closed; no personal details in the audit row.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No trial request id provided.");
    const supabase = createClient();
    const { data: lead } = await supabase
      .from("trial_leads")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!lead) return apiError(404, "NOT_FOUND", "That trial request wasn't found.");

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "trial.deleted",
      entityType: "trial_leads",
      entityId: id,
      beforeState: { status: lead.status },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(500, "LEAD_DELETE_FAILED", "Something went wrong — nothing was deleted.");
    }
    const { data: deleted, error } = await supabase
      .from("trial_leads")
      .delete()
      .eq("id", id)
      .select("id");
    if (error || !deleted || deleted.length === 0) {
      console.error("[trial-leads] delete failed after audit", error?.code);
      return apiError(500, "LEAD_DELETE_FAILED", "Something went wrong — nothing was deleted.");
    }
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
