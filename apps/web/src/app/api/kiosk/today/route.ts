import { NextResponse, type NextRequest } from "next/server";
import { signedGymLogo } from "@/lib/storage/logo";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveKioskDevice, setKioskCookie } from "@/lib/kiosk/device";
import { kioskDisplayName, kioskSessionsOn } from "@/lib/kiosk/sessions";
import { checkInWindow, gymWallClock, sessionRuns } from "@matos/shared";

export const dynamic = "force-dynamic";

// GET /api/kiosk/today — kiosk device only. Flow audit 4.4: everything the
// front-desk screen shows: the gym's name, today's sessions with their
// check-in windows, the active roster as "First L." + belt, and who is
// already checked in to each session. Nothing else about members (no
// emails, phones, payments). Scoped to the device's gym.
export async function GET(request: NextRequest) {
  const device = await resolveKioskDevice(request);
  if (!device) {
    return apiError(401, "KIOSK_NOT_SET_UP", "This tablet isn't set up as a kiosk.");
  }

  const now = gymWallClock(new Date(), device.timeZone);
  const supabase = createServiceRoleClient();

  let sessions;
  try {
    sessions = await kioskSessionsOn(device.gymId, now.date);
  } catch {
    return apiError(500, "KIOSK_LOAD_FAILED", "Couldn't load today's classes.");
  }

  const [{ data: members, error: memberError }, { data: attendance, error: attendanceError }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, first_name, last_name, belt, stripes")
        .eq("gym_id", device.gymId)
        .eq("active", true)
        // Parent accounts (flow audit 8.2) aren't on the check-in list.
        .neq("role", "guardian")
        .order("first_name"),
      supabase
        .from("attendance")
        .select("member_id, class_id")
        .eq("gym_id", device.gymId)
        .eq("checked_in_date", now.date),
    ]);
  if (memberError || attendanceError) {
    return apiError(500, "KIOSK_LOAD_FAILED", "Couldn't load the member list.");
  }

  const checkedIn: Record<string, string[]> = {};
  for (const a of attendance ?? []) {
    (checkedIn[a.class_id] ??= []).push(a.member_id);
  }

  // Flow audit 10.5: the logo (signed; the screen keeps the first URL it
  // gets for a given path so polling doesn't reload the image).
  const logo = await signedGymLogo(device.gymId).catch(() => null);

  const response = NextResponse.json(
    {
      gymName: device.gymName,
      logo,
      today: now.date,
      minutesOfDay: now.minutesOfDay,
      sessions: sessions.map((s) => {
        const window = checkInWindow(s.startTime, s.classRow.duration_minutes);
        return {
          classId: s.classRow.id,
          name: s.classRow.name,
          classType: s.classRow.class_type,
          startTime: s.startTime,
          status: s.status,
          note: s.change?.note ?? null,
          runs: sessionRuns(s.status),
          opens: window.opens,
          closes: window.closes,
        };
      }),
      members: (members ?? []).map((m) => ({
        id: m.id,
        name: kioskDisplayName(m.first_name, m.last_name),
        belt: m.belt,
        stripes: m.stripes,
      })),
      checkedIn,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  // Sliding expiry: a kiosk in use keeps its cookie (see KIOSK_COOKIE_MAX_AGE).
  setKioskCookie(response, device.secret);
  return response;
}
