import { NextResponse } from "next/server";
import { isStaffRole } from "@/lib/auth/roles";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createInviteLinks } from "@/lib/auth/create-invite";
import { bulkInviteSchema } from "@matos/shared";

// POST /api/invite/bulk — coach/owner. Stage O4: mint fresh invite links for
// several members at once, returned to the coach for a printable QR sheet
// or to send individually. Same per-member rules as POST /api/invite
// (RLS-scoped lookup, active + unclaimed only, staff rows owner-only); rows
// that don't qualify are reported as skipped rather than failing the batch.
// Each link invalidates that member's previous unclaimed one.
export const maxDuration = 30;

export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "Personal workspaces don't have members to invite.");
    }

    const supabase = createClient();
    const { data: members, error } = await supabase
      .from("members")
      .select("id, gym_id, first_name, last_name, email, user_id, active, role")
      .in("id", input.member_ids);

    if (error) {
      console.error("[invite/bulk] member lookup failed", error);
      return apiError(500, "INVITE_CREATE_FAILED", "Something went wrong — no links were created.");
    }

    const { data: gym } = await supabase
      .from("gyms")
      .select("name")
      .eq("id", context.gymId)
      .single();
    const gymName = gym?.name ?? "your academy";

    const eligible = (members ?? []).filter(
      (m) =>
        m.active &&
        !m.user_id &&
        !!m.email &&
        m.gym_id === context.gymId &&
        (!isStaffRole(m.role) || context.role === "gym_owner"),
    );
    const skipped = input.member_ids.length - eligible.length;

    const result = await createInviteLinks(
      eligible.map((m) => ({ memberId: m.id, gymId: m.gym_id })),
      context.userId,
    );
    if (!result.ok) {
      return apiError(500, "INVITE_CREATE_FAILED", "Something went wrong — no links were created.");
    }

    const links = eligible.map((m) => ({
      memberId: m.id,
      name: `${m.first_name} ${m.last_name}`,
      claimUrl: result.links.get(m.id)!,
    }));

    links.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json(
      { success: true, gymName, links, skipped },
      // Claim URLs are credentials — never cache.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
  { requiredRole: "coach", schema: bulkInviteSchema },
);
