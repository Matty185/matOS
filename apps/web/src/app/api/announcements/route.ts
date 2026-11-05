import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLogStrict } from "@/lib/audit/log";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import {
  ANNOUNCEMENT_MAX_DAYS,
  addDaysToDate,
  createAnnouncementSchema,
  gymWallClock,
} from "@matos/shared";

/** Live (still showing) announcements per gym. Keeps Home short. */
const MAX_LIVE = 10;

// POST /api/announcements — coach/owner. Flow audit 7.1: post a gym-wide
// announcement (closure, seminar, grading), shown to every member until
// show_until (inclusive, gym timezone). RLS (insert_staff) is the boundary;
// created_by is forced to the caller by trigger. Audited strictly: if the
// audit row can't be written, the post is removed again.
export const POST = withAuth(
  async (_request: NextRequest, context, input) => {
    if (context.gymKind === "personal") {
      return apiError(
        403,
        "FORBIDDEN",
        "Announcements are for academies, not personal workspaces.",
      );
    }
    const supabase = createClient();

    const timeZone = await getGymTimeZone(supabase, context.gymId);
    const today = gymWallClock(new Date(), timeZone).date;
    if (input.show_until < today) {
      return apiError(400, "SHOW_UNTIL_PAST", "Pick a date from today onwards.");
    }
    if (input.show_until > addDaysToDate(today, ANNOUNCEMENT_MAX_DAYS)) {
      return apiError(
        400,
        "SHOW_UNTIL_TOO_FAR",
        `An announcement can stay up for at most ${ANNOUNCEMENT_MAX_DAYS} days.`,
      );
    }

    const { count, error: countError } = await supabase
      .from("announcements")
      .select("id", { count: "exact", head: true })
      .gte("show_until", today);
    if (countError) {
      return apiError(500, "ANNOUNCEMENT_FAILED", "Something went wrong — nothing was posted.");
    }
    if ((count ?? 0) >= MAX_LIVE) {
      return apiError(
        409,
        "TOO_MANY_LIVE",
        `There are already ${MAX_LIVE} announcements showing. Delete one first.`,
      );
    }

    const { data: created, error } = await supabase
      .from("announcements")
      .insert({
        gym_id: context.gymId,
        title: input.title,
        body: input.body ?? null,
        show_until: input.show_until,
      })
      .select("id")
      .single();
    if (error || !created) {
      if (error?.code === "23514") {
        return apiError(400, "INVALID_ANNOUNCEMENT", "That announcement isn't valid.");
      }
      console.error("[announcements] insert failed", error?.code);
      return apiError(500, "ANNOUNCEMENT_FAILED", "Something went wrong — nothing was posted.");
    }

    const audited = await writeAuditLogStrict({
      gymId: context.gymId,
      actorId: context.userId,
      action: "announcement.posted",
      entityType: "announcements",
      entityId: created.id,
      afterState: { title: input.title, body: input.body ?? null, show_until: input.show_until },
      initiatedBy: "coach_manual",
    });
    if (!audited) {
      const { error: revertError } = await supabase
        .from("announcements")
        .delete()
        .eq("id", created.id);
      if (revertError) console.error("[announcements] revert after audit failure failed");
      return apiError(500, "ANNOUNCEMENT_FAILED", "Something went wrong — nothing was posted.");
    }

    return NextResponse.json({ success: true, announcementId: created.id }, { status: 201 });
  },
  { requiredRole: "coach", schema: createAnnouncementSchema },
);
