import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

// POST /api/gym/onboarding — owner. Stage O4: marks the /setup wizard
// finished (or skipped), so the owner lands on the dashboard from now on.
// Idempotent: only stamps the first time.
export const POST = withAuth(
  async (_request, context) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have gym setup.");
    }

    const supabase = createClient();
    const { data: updated, error } = await supabase
      .from("gyms")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", context.gymId)
      .is("onboarding_completed_at", null)
      .select("id");

    if (error) {
      console.error("[gym/onboarding] update failed", error);
      return apiError(500, "ONBOARDING_UPDATE_FAILED", "Something went wrong — try again.");
    }

    if (updated && updated.length > 0) {
      await writeAuditLog({
        gymId: context.gymId,
        actorId: context.userId,
        action: "gym.onboarding_completed",
        entityType: "gyms",
        entityId: context.gymId,
        initiatedBy: "coach_manual",
      });
    }

    return NextResponse.json({ success: true });
  },
  { requiredRole: "gym_owner" },
);
