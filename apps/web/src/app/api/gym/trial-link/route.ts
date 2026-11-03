import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { trialLinkSchema } from "@matos/shared";

// POST /api/gym/trial-link — owner only. Flow audit 9.1: turn the gym's
// public trial link on (new random code), change it (old link stops working
// at once), or turn it off. gyms_update_owner RLS is the real boundary;
// codes are always generated here, never chosen by the client. Audited
// strictly: the previous code is restored if the audit row can't be
// written.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l lookalikes

function newCode(): string {
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Trial links are for gyms, not personal workspaces.");
    }
    if (context.role !== "gym_owner") {
      return apiError(403, "FORBIDDEN", "Only the gym owner can change the trial link.");
    }
    const supabase = createClient();
    const { data: before } = await supabase
      .from("gyms")
      .select("trial_code")
      .eq("id", context.gymId)
      .single();
    const previous = before?.trial_code ?? null;

    const code = input.action === "disable" ? null : newCode();
    if (input.action === "enable" && previous) {
      return NextResponse.json({ success: true, code: previous });
    }

    const { data: updated, error } = await supabase
      .from("gyms")
      .update({ trial_code: code })
      .eq("id", context.gymId)
      .select("id");
    if (error || !updated || updated.length === 0) {
      console.error("[trial-link] update failed", error?.code);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action:
        input.action === "disable"
          ? "trial_link.disabled"
          : input.action === "regenerate"
            ? "trial_link.changed"
            : "trial_link.enabled",
      entityType: "gyms",
      entityId: context.gymId,
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      await supabase.from("gyms").update({ trial_code: previous }).eq("id", context.gymId);
      return apiError(500, "GYM_UPDATE_FAILED", "Something went wrong — the change wasn't saved.");
    }

    return NextResponse.json({ success: true, code });
  },
  { requiredRole: "coach", schema: trialLinkSchema },
);
