import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { publishWaiverSchema } from "@matos/shared";

// POST /api/waiver — owner. Flow audit 9.3: publish a new version of the
// gym's liability waiver. Versions are immutable and numbered by the DB;
// publishing asks every member to sign again. RLS
// (waiver_versions_insert_owner) is the real gate. Audit-first (below).
export const POST = withAuth(
  async (_request: NextRequest, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Waivers are for academies, not personal workspaces.");
    }
    if (context.role !== "gym_owner") {
      return apiError(403, "FORBIDDEN", "Only the academy owner can change the waiver.");
    }
    const supabase = createClient();

    // Audit-first: a version can't be edited or deleted by the app once
    // published, so it must never exist without its audit row. If the insert
    // then fails, the log shows an attempt that didn't land, which is the
    // safer way round.
    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "waiver.published",
      entityType: "waiver_versions",
      afterState: { length: input.body.length },
      initiatedBy: input.agent_query ? "agent" : "coach_manual",
      agentQuery: input.agent_query ?? null,
    });
    if (!audited) {
      return apiError(
        500,
        "WAIVER_PUBLISH_FAILED",
        "Something went wrong — the waiver wasn't saved.",
      );
    }

    const { data: created, error } = await supabase
      .from("waiver_versions")
      .insert({ gym_id: context.gymId, body: input.body, version: 0 }) // version set by trigger
      .select("id, version")
      .single();
    if (error || !created) {
      console.error("[waiver] publish failed after audit", error?.code);
      return apiError(
        500,
        "WAIVER_PUBLISH_FAILED",
        "Something went wrong — the waiver wasn't saved.",
      );
    }

    return NextResponse.json({ success: true, version: created.version }, { status: 201 });
  },
  { requiredRole: "coach", schema: publishWaiverSchema },
);
