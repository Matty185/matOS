import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { accountEditSchema } from "@matos/shared";

// PATCH /api/account — any authenticated member, self only (context.memberId,
// never a client-supplied id). Contact fields only, matching exactly what
// Stage 1's enforce_member_self_update_scope trigger permits an athlete to
// change on their own row — a coach/owner hitting this same route is
// unrestricted by that trigger but the route itself never writes anything
// beyond these three fields regardless of role, so the practical effect is
// identical either way.
export const PATCH = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();

    const { data: before } = await supabase
      .from("members")
      .select("phone, emergency_contact_name, emergency_contact_phone")
      .eq("id", context.memberId)
      .single();

    const { error: updateError } = await supabase
      .from("members")
      .update({
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
      })
      .eq("id", context.memberId);

    if (updateError) {
      return apiError(
        500,
        "ACCOUNT_UPDATE_FAILED",
        "Something went wrong — the change wasn't saved.",
      );
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "member.self_updated_contact",
      entityType: "members",
      entityId: context.memberId,
      beforeState: before ?? null,
      afterState: {
        phone: input.phone || null,
        emergency_contact_name: input.emergency_contact_name || null,
        emergency_contact_phone: input.emergency_contact_phone || null,
      },
      initiatedBy: "self_service",
    });

    return NextResponse.json({ success: true });
  },
  { schema: accountEditSchema },
);
