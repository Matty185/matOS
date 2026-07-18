import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { recordPaymentSchema } from "@/lib/validation/payment";

// POST /api/payments/record — coach/owner only. Records or edits a single
// member's payment for a single period (any status: paid/unpaid/waived),
// unlike /api/payments/mark-paid which only ever marks the current month
// paid. This is the payments grid's cell editor — per plan §10 row 6
// ("Payments module: grid, per-member, computed overdue, alerts").
// gym_id is always context.gymId, never client-trusted; the
// derive_gym_id_from_member trigger (Stage 1) independently rejects a
// member_id belonging to a different gym regardless.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const paidAt = input.status === "paid" ? new Date().toISOString() : null;

    const { data: existing } = await supabase
      .from("payments")
      .select("status, amount, notes")
      .eq("member_id", input.member_id)
      .eq("period_month", input.period_month)
      .eq("period_year", input.period_year)
      .maybeSingle();

    const { data: saved, error } = await supabase
      .from("payments")
      .upsert(
        {
          member_id: input.member_id,
          gym_id: context.gymId,
          period_month: input.period_month,
          period_year: input.period_year,
          status: input.status,
          amount: input.amount ?? null,
          notes: input.notes ?? null,
          paid_at: paidAt,
          recorded_by: context.userId,
        },
        { onConflict: "member_id,period_month,period_year" },
      )
      .select("id")
      .single();

    if (error || !saved) {
      return apiError(
        500,
        "RECORD_PAYMENT_FAILED",
        "Something went wrong — the payment wasn't saved.",
      );
    }

    const action =
      input.status === "paid"
        ? "payment.marked_paid"
        : input.status === "waived"
          ? "payment.waived"
          : "payment.marked_unpaid";

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action,
      entityType: "payments",
      entityId: saved.id,
      beforeState: existing ? { ...existing } : null,
      afterState: {
        status: input.status,
        amount: input.amount ?? null,
        period_month: input.period_month,
        period_year: input.period_year,
      },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true }, { status: 200 });
  },
  { requiredRole: "coach", schema: recordPaymentSchema },
);
