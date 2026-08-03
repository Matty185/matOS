import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";

// POST /api/account/delete-request — any authenticated member, self only.
// Plan §7's GDPR flow: "athlete requests -> deletion_requests row + coach
// in-app notification record -> coach executes from gym settings."
//
// deletion_requests insert goes through the RLS client (deletion_requests_
// insert_self policy already covers this — Stage 1). The notifications
// insert is the one write in this route that needs the service-role
// client: Stage 1's RLS deliberately left no authenticated INSERT policy on
// notifications ("Writes (INSERT) are service-role only" — see the RLS
// migration's own comment), since an authenticated-insert policy would let
// any member spam a notification row into any other user's inbox. This is a
// narrow, structurally-required extension of CLAUDE.md Rule 4's service-role
// list (invite generation / audit log / seeding) rather than a new pattern —
// there is no RLS path that could do this insert instead.
export const POST = withAuth(async (_request, context) => {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("deletion_requests")
    .select("id")
    .eq("member_id", context.memberId)
    .is("executed_at", null)
    .maybeSingle();

  if (existing) {
    return apiError(
      409,
      "DELETION_ALREADY_REQUESTED",
      "You already have a pending deletion request.",
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("deletion_requests")
    .insert({ member_id: context.memberId, gym_id: context.gymId })
    .select("id")
    .single();

  if (insertError || !created) {
    return apiError(
      500,
      "DELETE_REQUEST_FAILED",
      "Something went wrong — the request wasn't saved.",
    );
  }

  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name")
    .eq("id", context.memberId)
    .single();

  const serviceClient = createServiceRoleClient();
  const { data: staff } = await serviceClient
    .from("members")
    .select("user_id")
    .eq("gym_id", context.gymId)
    .eq("active", true)
    .in("role", ["coach", "gym_owner"])
    .not("user_id", "is", null);

  if (staff && staff.length > 0) {
    await serviceClient.from("notifications").insert(
      staff.map((s) => ({
        gym_id: context.gymId,
        recipient_user_id: s.user_id as string,
        type: "deletion_request",
        payload: {
          deletion_request_id: created.id,
          member_id: context.memberId,
          member_name: member ? `${member.first_name} ${member.last_name}` : "A member",
        },
      })),
    );
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "gdpr.deletion_requested",
    entityType: "deletion_requests",
    entityId: created.id,
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true }, { status: 201 });
});
