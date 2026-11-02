import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { markPaidSchema } from "@matos/shared";
import { isBillable } from "@/lib/payments/overdue";

// POST /api/payments/mark-paid — coach/owner only. Bulk-marks the *current*
// calendar month paid for the given members, per plan §7's Member List
// "bulk mark-paid" action. The full gym-wide multi-month payments grid is
// Stage 6 — this is deliberately just enough to make the Member List's own
// spec functional now. RLS (payments_insert_staff/update_staff, plus the
// derive_gym_id_from_member trigger from Stage 1) naturally rejects a
// member_id belonging to a different gym — no separate ownership check
// needed here, but a per-member failure doesn't abort the rest of the batch.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const now = new Date();
    const periodMonth = now.getMonth() + 1;
    const periodYear = now.getFullYear();

    const succeeded: string[] = [];
    const failed: string[] = [];

    // Only members who owe a monthly fee (isBillable). RLS scopes the read
    // to the caller's gym, so other gyms' ids drop out as failed.
    const { data: rows } = await supabase
      .from("members")
      .select("id, role, membership_plan")
      .in("id", input.member_ids);
    const billableIds = new Set((rows ?? []).filter(isBillable).map((m) => m.id));

    for (const memberId of input.member_ids) {
      if (!billableIds.has(memberId)) {
        failed.push(memberId);
        continue;
      }
      const { error } = await supabase.from("payments").upsert(
        {
          member_id: memberId,
          gym_id: context.gymId,
          period_month: periodMonth,
          period_year: periodYear,
          status: "paid",
          paid_at: now.toISOString(),
          recorded_by: context.userId,
        },
        { onConflict: "member_id,period_month,period_year" },
      );

      if (error) {
        failed.push(memberId);
      } else {
        succeeded.push(memberId);
      }
    }

    if (succeeded.length > 0) {
      await writeAuditLog({
        gymId: context.gymId,
        actorId: context.userId,
        action: "payment.bulk_marked_paid",
        entityType: "payments",
        afterState: { member_ids: succeeded, period_month: periodMonth, period_year: periodYear },
        initiatedBy: "coach_manual",
      });
    }

    return NextResponse.json({ success: failed.length === 0, succeeded, failed });
  },
  { requiredRole: "coach", schema: markPaidSchema },
);
