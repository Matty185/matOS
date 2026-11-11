import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { reviewPaymentEventSchema } from "@matos/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/payment-events/[id]/review — coach/owner. Stage L2: mark an
// online payment that needed a look as checked (or undo that). RLS
// (payment_events_update_staff), the reviewed_at-only column grant and the
// guard trigger (who and when are stamped by the database) are the boundary.
export const POST = withAuth(
  async (_request, context, input, params) => {
    const id = typeof params.id === "string" ? params.id : "";
    if (!UUID.test(id)) return apiError(404, "NOT_FOUND", "Payment not found.");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("payment_events")
      .update({ reviewed_at: input.reviewed ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id, outcome")
      .maybeSingle();
    if (error) {
      console.error("[payment-events] review failed", error.code);
      return apiError(500, "REVIEW_FAILED", "Something went wrong. Try again.");
    }
    if (!data) return apiError(404, "NOT_FOUND", "Payment not found.");
    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: input.reviewed ? "payment_event.reviewed" : "payment_event.unreviewed",
      entityType: "payment_events",
      entityId: data.id,
      afterState: { outcome: data.outcome },
      initiatedBy: "coach_manual",
    });
    return NextResponse.json({ success: true });
  },
  { requiredRole: "coach", schema: reviewPaymentEventSchema },
);
