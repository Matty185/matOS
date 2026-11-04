import Link from "next/link";
import { CalendarDays, FileSignature, Flame } from "lucide-react";
import { fetchCurrentWaiver } from "@/lib/waivers";
import { Button } from "@/components/ui/button";
import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CLASS_PROGRAM_LABELS,
  addDaysToDate,
  computeAttendanceStreak,
  computeUpcomingClasses,
  describeSessionChange,
  formatClassTime,
  formatSessionDate,
  gymWallClock,
  type SessionChange,
} from "@matos/shared";
import { Badge } from "@/components/ui/badge";
import { fetchSessionChanges } from "@/lib/classes/session-changes";
import { fetchLiveAnnouncements } from "@/lib/announcements/fetch";
import { AnnouncementCard, type AnnouncementView } from "@/components/shared/announcement-card";
import { getGymTimeZone } from "@/lib/time/gym-timezone";
import { getPaymentsTrackedFrom } from "@/lib/payments/tracked-from";
import { summariseAthletePayments } from "@/lib/payments/athlete-status";
import { MembershipStatusCard } from "@/components/shared/membership-status-card";
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

export default async function AthleteHomePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = createClient();

  const [
    { data: memberRow },
    { data: attendanceRows },
    { data: classRows },
    { data: paymentRows, error: paymentsError },
    paymentsTrackedFrom,
    { data: holdRows, error: holdsError },
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id, belt, stripes, role, membership_plan, join_date, plan:gym_plans(name)")
      .eq("id", member.memberId)
      .single(),
    supabase.from("attendance").select("checked_in_date").eq("member_id", member.memberId),
    supabase.from("classes").select("*").eq("active", true),
    // Flow audit 6.4: own payment statuses. Never select `amount` here
    // (CLAUDE.md Rule 3: athletes don't see amounts, even their own).
    supabase
      .from("payments")
      .select("period_month, period_year, status")
      .eq("member_id", member.memberId),
    getPaymentsTrackedFrom(supabase),
    // Flow audit 2.4: own holds (RLS: membership_holds_select_self).
    supabase
      .from("membership_holds")
      .select("member_id, start_month, end_month")
      .eq("member_id", member.memberId),
  ]);

  // Flow audit 3.2: list from the gym's today with one-off changes applied
  // (cancelled / moved sessions). If the changes can't be read, show the plain
  // timetable rather than failing the page.
  const timeZone = await getGymTimeZone(supabase, member.gymId);
  const today = gymWallClock(new Date(), timeZone).date;
  let changes: SessionChange[] = [];
  try {
    changes = await fetchSessionChanges(supabase, today, addDaysToDate(today, 6));
  } catch {
    console.error("[home] couldn't load class changes");
  }

  // Flow audit 7.1: gym announcements first. Degrade to none on error.
  let announcements: AnnouncementView[] = [];
  try {
    announcements = await fetchLiveAnnouncements(supabase, today);
  } catch {
    console.error("[home] couldn't load announcements");
  }

  // Flow audit 9.3: prompt to sign the gym's current waiver. Degrades to no
  // prompt on error (signing is never required to train).
  let waiverToSign = false;
  try {
    const waiver = await fetchCurrentWaiver(supabase);
    if (waiver) {
      const { data: sig, error: sigError } = await supabase
        .from("waiver_signatures")
        .select("id")
        .eq("member_id", member.memberId)
        .eq("waiver_version_id", waiver.id)
        .is("voided_at", null)
        .maybeSingle();
      if (sigError) throw sigError;
      waiverToSign = !sig;
    }
  } catch {
    console.error("[home] couldn't load waiver status");
  }

  // Flow audit 3.3: coach names (athletes can't read staff rows directly).
  const { data: coachRows } = await supabase.rpc("class_coach_names");
  const coachByClass = new Map((coachRows ?? []).map((r) => [r.class_id, r.coach_name]));

  const streak = computeAttendanceStreak((attendanceRows ?? []).map((a) => a.checked_in_date));
  const upcoming = computeUpcomingClasses(classRows ?? [], { fromDate: today, changes, cap: 6 });
  // Never show a wrong "overdue": if payments can't be read, say so instead.
  // Holds too: without them a frozen month would read as overdue.
  const membershipError = paymentsError ?? holdsError;
  if (membershipError) console.error("[home] couldn't load payments or holds");
  const paymentSummary =
    memberRow && !membershipError
      ? summariseAthletePayments(
          memberRow,
          paymentRows ?? [],
          paymentsTrackedFrom,
          today,
          holdRows ?? [],
        )
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl tracking-wide">Welcome, {member.firstName}</h1>
        {memberRow ? (
          <BeltDisplay belt={memberRow.belt} stripes={memberRow.stripes} size="lg" showLabel />
        ) : null}
      </div>

      {waiverToSign ? (
        <section
          className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="waiver-prompt-heading"
        >
          <div className="flex items-start gap-3">
            <FileSignature className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="flex flex-col gap-1">
              <h2 id="waiver-prompt-heading" className="font-medium">
                Please sign the gym&apos;s waiver
              </h2>
              <p className="text-sm text-muted-foreground">It takes a minute.</p>
            </div>
          </div>
          <Button asChild className="h-11">
            <Link href="/waiver">Read and sign</Link>
          </Button>
        </section>
      ) : null}

      {announcements.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="announcements-heading">
          <h2 id="announcements-heading" className="sr-only">
            Announcements
          </h2>
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} today={today} />
          ))}
        </section>
      ) : null}

      <div className="flex items-center gap-3 rounded-md border p-4">
        <Flame className="h-8 w-8 shrink-0 text-primary" />
        <div>
          <p className="text-2xl font-semibold">
            {streak} {streak === 1 ? "week" : "weeks"}
          </p>
          <p className="text-sm text-muted-foreground">Current attendance streak</p>
        </div>
      </div>

      {paymentSummary && memberRow ? (
        <MembershipStatusCard
          plan={memberRow.membership_plan}
          planName={memberRow.plan?.name}
          summary={paymentSummary}
        />
      ) : membershipError ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load your membership status. Try refreshing.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Upcoming classes</h2>
          <Link
            href="/timetable"
            className="inline-flex h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Full timetable
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No classes scheduled"
            description="Your gym's schedule will show up here once it's set up."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((session, i) => {
              const { date, classRow, startTime, status, change } = session;
              const off = status === "cancelled" || status === "moved_away";
              const label = describeSessionChange(session);
              return (
                <li
                  key={`${classRow.id}-${date}-${i}`}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${off ? "border-dashed" : ""}`}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={`font-medium ${off ? "text-muted-foreground line-through" : ""}`}
                    >
                      {classRow.name}
                    </span>
                    <span className="text-muted-foreground">
                      {date === today ? "Today" : formatSessionDate(date)} ·{" "}
                      {formatClassTime(startTime)} · {CLASS_TYPE_LABELS[classRow.class_type]}
                      {classRow.program !== "all_levels"
                        ? ` · ${CLASS_PROGRAM_LABELS[classRow.program]}`
                        : ""}
                      {coachByClass.get(classRow.id) ? ` · ${coachByClass.get(classRow.id)}` : ""}
                    </span>
                    {label ? (
                      <span className="text-muted-foreground">
                        {label}
                        {change?.note ? ` · ${change.note}` : ""}
                      </span>
                    ) : null}
                  </div>
                  {status === "cancelled" ? (
                    <Badge variant="destructive">Cancelled</Badge>
                  ) : status === "moved_away" ? (
                    <Badge variant="secondary">Moved</Badge>
                  ) : status === "moved_in" ? (
                    <Badge variant="secondary">Changed</Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
