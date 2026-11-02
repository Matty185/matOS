import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLogStrict } from "@/lib/audit/log";

// DELETE /api/signup-links/[id] — coach/owner. Stage O7: cancel an unused
// sign-up link (expires it; rows are never deleted). The RLS read below is
// the gym-scoping check — a link from another gym simply isn't found.
export const DELETE = withAuth(
  async (_request: NextRequest, context, _input, params) => {
    const id = params.id;
    if (!id) return apiError(400, "MISSING_ID", "No link id provided.");

    const supabase = createClient();
    const { data: link } = await supabase
      .from("signup_links")
      .select("id, used_at, expires_at")
      .eq("id", id)
      .maybeSingle();

    if (!link) return apiError(404, "LINK_NOT_FOUND", "That link wasn't found.");
    if (link.used_at) return apiError(409, "LINK_USED", "That link has already been used.");
    if (new Date(link.expires_at) <= new Date()) {
      return NextResponse.json({ success: true });
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "signup_link.cancelled",
      entityType: "signup_links",
      entityId: link.id,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      return apiError(
        500,
        "LINK_CANCEL_FAILED",
        "Something went wrong — the link wasn't cancelled.",
      );
    }

    const { error } = await createServiceRoleClient()
      .from("signup_links")
      .update({ expires_at: new Date().toISOString() })
      .eq("id", link.id)
      .is("used_at", null);
    if (error) {
      console.error("[signup-links] cancel failed", error);
      return apiError(
        500,
        "LINK_CANCEL_FAILED",
        "Something went wrong — the link wasn't cancelled.",
      );
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach" },
);
