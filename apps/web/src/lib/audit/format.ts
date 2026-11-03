import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClassTime, formatSessionDate, type Database, type Json } from "@matos/shared";

export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];
type Client = SupabaseClient<Database>;

export type AuditNameContext = {
  // actor_id (auth.users id) -> "First Last", for staff/self actors.
  byUserId: Map<string, string>;
  // members.id -> "First Last" — covers entity_type 'members' directly.
  byMemberId: Map<string, string>;
  // `${entity_type}:${entity_id}` -> "First Last", for entity types one
  // hop away from a member (payments/attendance/invites entity rows).
  entityToMemberName: Map<string, string>;
  // classes.id -> class name.
  classNames: Map<string, string>;
};

// Batch-resolves every name a page of audit_log rows could need in a
// handful of queries total, not one query per row. Members lookups fetch
// the whole gym roster once (RLS-scoped automatically, cheap at alpha
// scale — matches the same "fetch broadly, compute in JS" approach
// src/lib/payments/overdue.ts already uses) since both actor_id (keyed by
// auth user_id) and entity_id (keyed by members.id, for entity_type
// 'members') need different lookup keys into the same table.
export async function resolveAuditNames(
  supabase: Client,
  rows: AuditLogRow[],
): Promise<AuditNameContext> {
  const { data: allMembers } = await supabase
    .from("members")
    .select("id, user_id, first_name, last_name");

  const byUserId = new Map<string, string>();
  const byMemberId = new Map<string, string>();
  for (const m of allMembers ?? []) {
    const name = `${m.first_name} ${m.last_name}`;
    if (m.user_id) byUserId.set(m.user_id, name);
    byMemberId.set(m.id, name);
  }

  const idsFor = (entityType: string) =>
    rows
      .filter((r) => r.entity_type === entityType && r.entity_id)
      .map((r) => r.entity_id as string);

  const paymentIds = idsFor("payments");
  const attendanceIds = idsFor("attendance");
  const classIds = idsFor("classes");
  const inviteIds = idsFor("invites");

  const [paymentsRes, attendanceRes, classesRes, invitesRes] = await Promise.all([
    paymentIds.length
      ? supabase.from("payments").select("id, member_id").in("id", paymentIds)
      : { data: [] },
    attendanceIds.length
      ? supabase.from("attendance").select("id, member_id").in("id", attendanceIds)
      : { data: [] },
    classIds.length ? supabase.from("classes").select("id, name").in("id", classIds) : { data: [] },
    inviteIds.length
      ? supabase.from("invites").select("id, member_id").in("id", inviteIds)
      : { data: [] },
  ]);

  const entityToMemberName = new Map<string, string>();
  for (const p of paymentsRes.data ?? []) {
    entityToMemberName.set(`payments:${p.id}`, byMemberId.get(p.member_id) ?? "a member");
  }
  for (const a of attendanceRes.data ?? []) {
    entityToMemberName.set(`attendance:${a.id}`, byMemberId.get(a.member_id) ?? "a member");
  }
  for (const i of invitesRes.data ?? []) {
    entityToMemberName.set(`invites:${i.id}`, byMemberId.get(i.member_id) ?? "a member");
  }
  const classNames = new Map<string, string>(
    (classesRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
  );

  return { byUserId, byMemberId, entityToMemberName, classNames };
}

function actorNameFor(row: AuditLogRow, ctx: AuditNameContext): string {
  if (row.actor_id) return ctx.byUserId.get(row.actor_id) ?? "A former member";
  return row.initiated_by === "agent" ? "The assistant" : "System";
}

function subjectNameFor(row: AuditLogRow, ctx: AuditNameContext): string {
  if (row.entity_type === "members" && row.entity_id) {
    return ctx.byMemberId.get(row.entity_id) ?? "a member";
  }
  if (row.entity_id) {
    const key = `${row.entity_type}:${row.entity_id}`;
    if (ctx.entityToMemberName.has(key)) return ctx.entityToMemberName.get(key)!;
  }
  return "a member";
}

function className(row: AuditLogRow, ctx: AuditNameContext): string {
  if (row.entity_id) return ctx.classNames.get(row.entity_id) ?? "a class";
  return "a class";
}

function asRecord(value: Json | null): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

const PERIOD_LABEL = (state: Record<string, Json>) => {
  const month = state.period_month;
  const year = state.period_year;
  return typeof month === "number" && typeof year === "number"
    ? `${String(month).padStart(2, "0")}/${year}`
    : "that period";
};

function sessionDateLabel(value: Json | undefined): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatSessionDate(value)
    : "a date";
}

// "Plain-English actions" per plan §7 (dashboard recent-activity feed) and
// §7's audit log spec — every action string writeAuditLog() is ever called
// with (24 as of Stage 11) maps to a real sentence here; unrecognized
// future actions fall back to a generic-but-still-readable description
// rather than a raw action code.
export function describeAuditEntry(row: AuditLogRow, ctx: AuditNameContext): string {
  const actor = actorNameFor(row, ctx);
  const after = asRecord(row.after_state);

  switch (row.action) {
    case "member.created":
      return `${actor} added ${subjectNameFor(row, ctx)} as a new member.`;
    case "member.updated":
      return `${actor} updated ${subjectNameFor(row, ctx)}'s details.`;
    case "member.promoted": {
      const belt = typeof after.belt === "string" ? after.belt.replace(/_/g, " ") : "a new belt";
      const stripes =
        typeof after.stripes === "number" && after.stripes > 0 ? ` (${after.stripes} stripes)` : "";
      return `${actor} promoted ${subjectNameFor(row, ctx)} to ${belt}${stripes}.`;
    }
    case "member.deactivated":
      return `${actor} deactivated ${subjectNameFor(row, ctx)}.`;
    case "member.reactivated":
      return `${actor} reactivated ${subjectNameFor(row, ctx)}.`;
    case "member.hold_added":
    case "member.hold_changed":
    case "member.hold_removed": {
      // Flow audit 2.4: the member is in the state, not the entity id.
      const before = asRecord(row.before_state);
      const memberId = typeof after.member_id === "string" ? after.member_id : before.member_id;
      const who =
        (typeof memberId === "string" ? ctx.byMemberId.get(memberId) : undefined) ?? "a member";
      const month = (v: unknown) =>
        typeof v === "string"
          ? new Intl.DateTimeFormat("en-IE", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${v.slice(0, 7)}-01T00:00:00Z`))
          : "?";
      if (row.action === "member.hold_added") {
        return `${actor} put ${who}'s membership on hold, ${month(after.start_month)} to ${month(after.end_month)}.`;
      }
      if (row.action === "member.hold_changed") {
        return `${actor} changed ${who}'s hold to end in ${month(after.end_month)} (was ${month(before.end_month)}).`;
      }
      return `${actor} removed ${who}'s membership hold (${month(before.start_month)} to ${month(before.end_month)}).`;
    }
    case "member.self_updated_contact":
      return `${actor} updated their own contact details.`;
    case "member.data_exported":
      return `${actor} exported their data.`;
    case "gdpr.deletion_requested":
      return `${actor} requested account deletion.`;
    case "gdpr.deletion_executed":
      return `${actor} executed account deletion for ${subjectNameFor(row, ctx)}.`;
    case "payment.marked_paid":
      return `${actor} marked ${subjectNameFor(row, ctx)}'s ${PERIOD_LABEL(after)} payment as paid.`;
    case "payment.marked_unpaid":
      return `${actor} marked ${subjectNameFor(row, ctx)}'s ${PERIOD_LABEL(after)} payment as unpaid.`;
    case "payment.waived":
      return `${actor} waived ${subjectNameFor(row, ctx)}'s ${PERIOD_LABEL(after)} payment.`;
    case "payment.bulk_marked_paid": {
      const count = Array.isArray(after.member_ids) ? after.member_ids.length : "several";
      return `${actor} marked ${count} overdue payment${count === 1 ? "" : "s"} as paid for ${PERIOD_LABEL(after)}.`;
    }
    case "attendance.marked":
      return `${actor} marked ${subjectNameFor(row, ctx)} present at a class.`;
    case "attendance.kiosk_checked_in":
      return `${subjectNameFor(row, ctx)} checked in at the front-desk kiosk.`;
    case "kiosk_device.created":
      return `${actor} added the kiosk "${typeof after.name === "string" ? after.name : "tablet"}".`;
    case "kiosk_device.activated":
      return `The kiosk "${typeof after.name === "string" ? after.name : "tablet"}" was set up on a tablet.`;
    case "kiosk_device.revoked": {
      const before = asRecord(row.before_state);
      return `${actor} removed the kiosk "${typeof before.name === "string" ? before.name : "tablet"}".`;
    }
    case "attendance.removed":
      return `${actor} removed a check-in for ${subjectNameFor(row, ctx)}.`;
    case "attendance.self_checked_in":
      // Stage M7 gate fix (security-reviewer): offline_queued was being
      // written on every insert but had no read path anywhere — the
      // audit trail's own raw afterState carried it, but the rendered
      // description (what a coach actually reads) never surfaced it.
      return after.offline_queued
        ? `${actor} checked in (reconciled from an offline attempt).`
        : `${actor} checked in.`;
    case "class.created":
      return `${actor} added a new class: ${className(row, ctx)}.`;
    case "class.updated":
      return `${actor} updated the class ${className(row, ctx)}.`;
    case "class.deleted":
      return `${actor} removed the class ${className(row, ctx)}.`;
    case "class.session_cancelled":
      return `${actor} cancelled ${className(row, ctx)} on ${sessionDateLabel(after.session_date)}.`;
    case "class.session_moved":
      return `${actor} moved ${className(row, ctx)} on ${sessionDateLabel(after.session_date)} to ${sessionDateLabel(after.new_date)}${typeof after.new_start_time === "string" ? `, ${formatClassTime(after.new_start_time)}` : ""}.`;
    case "class.session_change_undone": {
      const before = asRecord(row.before_state);
      return `${actor} undid the ${before.kind === "moved" ? "move" : "cancellation"} of ${className(row, ctx)} on ${sessionDateLabel(before.session_date)}.`;
    }
    case "announcement.posted":
      return `${actor} posted the announcement "${typeof after.title === "string" ? after.title : "untitled"}".`;
    case "announcement.deleted": {
      const before = asRecord(row.before_state);
      return `${actor} took down the announcement "${typeof before.title === "string" ? before.title : "untitled"}".`;
    }
    case "analysis.created":
      return `${actor} uploaded a video for analysis.`;
    case "athlete_log.created":
      return `${actor} added a training log entry.`;
    case "athlete_log.updated":
      return `${actor} updated a training log entry.`;
    case "athlete_log.deleted":
      return `${actor} deleted a training log entry.`;
    case "invite.created":
      return `${actor} sent an invite to ${subjectNameFor(row, ctx)}.`;
    case "invite.claimed":
      return `${actor} claimed their invite and joined.`;
    case "agent.query":
      return `${actor} asked the assistant a question.`;
    case "member.password_reset_link_created":
      return `${actor} created a password reset link for ${subjectNameFor(row, ctx)}.`;
    case "members.imported": {
      const count = typeof after.count === "number" ? after.count : 0;
      return `${actor} imported ${count} member${count === 1 ? "" : "s"}.`;
    }
    case "gym.updated":
      return `${actor} updated the gym's details.`;
    case "gym.promotion_rules_updated":
      return `${actor} changed the promotion guidance.`;
    case "gym.onboarding_completed":
      return `${actor} finished setting up the gym.`;
    case "team.coach_added":
      return `${actor} added ${subjectNameFor(row, ctx)} as a coach.`;
    case "team.role_changed": {
      const role = typeof after.role === "string" ? after.role : "";
      const label = role === "gym_owner" ? "an owner" : role === "coach" ? "a coach" : "an athlete";
      return `${actor} made ${subjectNameFor(row, ctx)} ${label}.`;
    }
    case "signup_link.created":
      return `${actor} created a sign-up link.`;
    case "signup_link.cancelled":
      return `${actor} cancelled a sign-up link.`;
    case "member.self_registered":
      return `${subjectNameFor(row, ctx)} joined using a sign-up link.`;
    case "gym.provisioned":
      return "Gym created on MatOS.";
    default:
      return `${actor} performed "${row.action}"${row.entity_type ? ` on ${row.entity_type}` : ""}.`;
  }
}
