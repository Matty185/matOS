import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { importMembersSchema } from "@matos/shared";

// POST /api/members/import — coach/owner. Stage O3: bulk roster import
// (pasted list / CSV, previewed and corrected client-side first).
//
// All-or-nothing via the import_members RPC (one transaction): a single bad
// row never leaves half a roster behind. Athletes only — coaches are added
// one at a time from Settings → Team (owner-only). p_gym_id / p_role are
// server-chosen; nothing gym- or role-shaped is read from the body.
//
// No invites are sent here: importing is "get the roster in", inviting is a
// separate, deliberate step (Members → Invite), so a coach can tidy the
// list before anyone receives anything.
export const POST = withAuth(
  async (_request, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(403, "FORBIDDEN", "You can't add members to a personal workspace.");
    }

    const supabase = createClient();
    const emails = input.members.flatMap((m) => (m.email ? [m.email] : []));

    // Friendly pre-check so the coach sees *which* rows clash, instead of a
    // single opaque unique-violation for the whole batch. The RPC's own
    // constraint still catches anything that races in between.
    // Chunked: 300 emails in one `in.(...)` filter makes a GET URL long
    // enough to risk header-size limits.
    const existing: { email: string | null }[] = [];
    for (let i = 0; i < emails.length; i += 50) {
      const { data, error: existingError } = await supabase
        .from("members")
        .select("email")
        .in("email", emails.slice(i, i + 50));
      if (existingError) {
        console.error("[members/import] duplicate pre-check failed", existingError);
        return apiError(500, "IMPORT_FAILED", "Something went wrong — nothing was imported.");
      }
      existing.push(...(data ?? []));
    }
    if (existing.length > 0) {
      const taken = new Set(existing.map((e) => e.email ?? ""));
      // Row numbers refer to the submitted list, including email-less rows.
      const rows = input.members.flatMap((m, i) => (m.email && taken.has(m.email) ? [i + 1] : []));
      return NextResponse.json(
        {
          error: `${rows.length} ${rows.length === 1 ? "person is" : "people are"} already in your gym (row ${rows.join(", ")}). Remove them and try again.`,
          code: "EMAIL_TAKEN",
          status: 409,
          rows,
        },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { data, error } = await supabase.rpc("import_members", {
      p_gym_id: context.gymId,
      p_role: "athlete",
      p_rows: input.members.map((m) => ({
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        phone: m.phone || null,
        emergency_contact_name: m.emergency_contact_name || null,
        emergency_contact_phone: m.emergency_contact_phone || null,
        membership_plan: m.membership_plan,
        notes: m.notes || null,
        belt: m.belt,
        stripes: m.stripes,
        join_date: m.join_date || null,
      })),
    });

    if (error || !data) {
      if (error?.code === "23505") {
        return apiError(
          409,
          "EMAIL_TAKEN",
          "Someone in this list was just added to your gym. Refresh and try again.",
        );
      }
      console.error("[members/import] import_members failed", error);
      return apiError(500, "IMPORT_FAILED", "Something went wrong — nothing was imported.");
    }

    // One summary entry, not one per member, and no PII dump — the members
    // themselves are the record of who was added.
    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "members.imported",
      entityType: "members",
      entityId: null,
      afterState: { count: data.length },
      initiatedBy: "coach_manual",
    });

    return NextResponse.json({ success: true, imported: data.length }, { status: 201 });
  },
  { requiredRole: "coach", schema: importMembersSchema },
);
