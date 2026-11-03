"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, differenceInCalendarWeeks } from "date-fns";
import { CalendarCheck, CreditCard, Award, Swords, NotebookText, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { AttendanceCalendar } from "@/components/shared/attendance-calendar";
import { PromoteBeltDialog } from "@/components/shared/promote-belt-dialog";
import { InviteShareDialog } from "@/components/shared/invite-share-dialog";
import { PasswordResetLinkDialog } from "@/components/shared/password-reset-link-dialog";
import { PaymentCellDialog } from "@/components/shared/payment-cell-dialog";
import { ProfileView } from "@/components/shared/profile-view";
import { MembershipHolds, useMemberHolds } from "@/components/shared/membership-holds";
import { MemberWaiver } from "@/components/shared/member-waiver";
import { holdCovering, holdMonths } from "@/lib/payments/holds";
import { useGymToday } from "@/hooks/use-gym-today";
import { PLAN_LABELS } from "@/lib/constants/member-labels";
import { isBillable, isOverdue, type PaymentStatus } from "@/lib/payments/overdue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Database, PromotionRule, Readiness } from "@matos/shared";

type Member = Database["public"]["Tables"]["members"]["Row"];
type Invite = { claimed_at: string | null; expires_at: string } | null;
type Consent = { data_storage_consent: boolean; consented_at: string | null } | null;
type Promotion = {
  readiness: Readiness;
  sinceLabel: string;
  lastIsInitial: boolean;
  rule: PromotionRule;
} | null;

export function MemberProfileClient({
  member,
  latestInvite,
  consent,
  canManageAccess,
  viewerIsOwner,
  promotion,
}: {
  promotion: Promotion;
  member: Member;
  latestInvite: Invite;
  consent: Consent;
  // Stage O2: invite/reset links for a coach or owner row are owner-only
  // (team management) — the API enforces it; this just hides the buttons.
  canManageAccess: boolean;
  viewerIsOwner: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [isDeactivating, setIsDeactivating] = useState(false);
  // ?invite=1 — set by the Add Member form so the coach lands straight on
  // "send them their link" after creating someone.
  const [inviteOpen, setInviteOpen] = useState(
    () => searchParams.get("invite") === "1" && !member.user_id && !!member.email && member.active,
  );
  const [resetOpen, setResetOpen] = useState(false);
  const [isMakingCoach, setIsMakingCoach] = useState(false);

  // Stage O5: owner turns an existing athlete into a coach (same endpoint
  // Settings → Team uses; DB enforces owner-only role changes).
  async function handleMakeCoach() {
    setIsMakingCoach(true);
    try {
      const res = await fetch(`/api/team/${member.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "coach" }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(
          body.needsInvite
            ? `${member.first_name} is now a coach — send them a fresh sign-up link (older links were cancelled).`
            : `${member.first_name} is now a coach.`,
        );
        router.refresh();
      } else {
        toast.error(body.error ?? "Couldn't change their role.");
      }
    } catch {
      toast.error("Couldn't change their role — check your connection.");
    } finally {
      setIsMakingCoach(false);
    }
  }

  async function handleReactivate() {
    setIsDeactivating(true);
    try {
      const res = await fetch(`/api/members/${member.id}/reactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(`${member.first_name} is active again.`);
        router.refresh();
      } else {
        toast.error(body.error ?? "Couldn't reactivate this member.");
      }
    } catch {
      toast.error("Couldn't reactivate — check your connection.");
    } finally {
      setIsDeactivating(false);
    }
  }

  async function handleDeactivate() {
    setIsDeactivating(true);
    try {
      const res = await fetch(`/api/members/${member.id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(`${member.first_name} has been deactivated.`);
        router.refresh();
      } else {
        toast.error(body.error ?? "Couldn't deactivate this member.");
      }
    } finally {
      setIsDeactivating(false);
    }
  }

  const isClaimed = Boolean(member.user_id);
  const inviteExpired = latestInvite && new Date(latestInvite.expires_at) < new Date();

  return (
    <div className="flex flex-col gap-6">
      <InviteShareDialog
        member={member}
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open && searchParams.get("invite")) router.replace(`/members/${member.id}`);
        }}
        hasActiveInvite={Boolean(latestInvite && !latestInvite.claimed_at && !inviteExpired)}
        onInviteCreated={() => router.refresh()}
      />
      <PasswordResetLinkDialog member={member} open={resetOpen} onOpenChange={setResetOpen} />
      <Link
        href="/members"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to members
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold"
            aria-hidden="true"
          >
            {member.first_name[0]}
            {member.last_name[0]}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-3xl tracking-wide">
              {member.first_name} {member.last_name}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <BeltDisplay belt={member.belt} stripes={member.stripes} size="sm" showLabel />
              <Badge variant="outline">{PLAN_LABELS[member.membership_plan]}</Badge>
              {member.active ? (
                <Badge variant="outline">Active</Badge>
              ) : (
                <Badge variant="secondary">Inactive</Badge>
              )}
              <OnHoldBadge memberId={member.id} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/members/${member.id}/edit`}>Edit</Link>
          </Button>
          <PromoteBeltDialog
            memberId={member.id}
            currentBelt={member.belt}
            currentStripes={member.stripes}
          />
          {!isClaimed && member.email && member.active && canManageAccess ? (
            <Button
              variant={latestInvite && !inviteExpired ? "outline" : "default"}
              className="h-11"
              onClick={() => setInviteOpen(true)}
            >
              {!latestInvite
                ? "Invite to MatOS"
                : inviteExpired
                  ? "Invite again (link expired)"
                  : "Share invite link"}
            </Button>
          ) : null}
          {viewerIsOwner && member.role === "athlete" && member.active ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="h-11" disabled={isMakingCoach}>
                  {isMakingCoach ? "Saving..." : "Make coach"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Make {member.first_name} a coach?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Coaches can see every member&apos;s details, payments and attendance. You can
                    change this later in Settings → Team.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="h-11" onClick={handleMakeCoach}>
                    Make coach
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {isClaimed && member.active && canManageAccess ? (
            <Button variant="outline" className="h-11" onClick={() => setResetOpen(true)}>
              Password reset link
            </Button>
          ) : null}
          {member.active ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="h-11">
                  Deactivate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate {member.first_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They&apos;ll no longer be able to sign in or be marked present at classes. Their
                    history is kept, and you can reactivate them from their profile later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="h-11"
                    onClick={handleDeactivate}
                    disabled={isDeactivating}
                  >
                    {isDeactivating ? "Deactivating..." : "Deactivate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="h-11">Reactivate</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reactivate {member.first_name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They&apos;ll be back on the active list with all their history.
                    {member.user_id
                      ? " They can sign in again with their existing password."
                      : " They haven't signed up yet — send them an invite afterwards."}
                    {isBillable(member)
                      ? " Any months they didn't pay while away will show as overdue on Payments. Put those months on hold (Payments tab) or waive the ones you don't want to chase."
                      : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="h-11"
                    onClick={handleReactivate}
                    disabled={isDeactivating}
                  >
                    {isDeactivating ? "Reactivating..." : "Reactivate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="belt-history">Belt History</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-4 pt-4">
          <MemberWaiver
            memberId={member.id}
            memberName={`${member.first_name} ${member.last_name}`}
            active={member.active}
            role={member.role}
            hasLogin={!!member.user_id}
          />
          <OverviewTab
            member={member}
            latestInvite={latestInvite}
            consent={consent}
            promotion={promotion}
          />
        </TabsContent>
        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab memberId={member.id} joinDate={member.join_date} />
        </TabsContent>
        <TabsContent value="payments" className="pt-4">
          <PaymentsTab
            billable={isBillable(member)}
            active={member.active}
            memberId={member.id}
            memberName={`${member.first_name} ${member.last_name}`}
            onPaymentChanged={() =>
              queryClient.invalidateQueries({ queryKey: ["member-payments", member.id] })
            }
          />
        </TabsContent>
        <TabsContent value="belt-history" className="pt-4">
          <BeltHistoryTab memberId={member.id} />
        </TabsContent>
        <TabsContent value="analysis" className="pt-4">
          <AnalysisTab memberId={member.id} />
        </TabsContent>
        <TabsContent value="logs" className="pt-4">
          <LogsTab memberId={member.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function promotionSummary(p: NonNullable<Promotion>): string {
  const r = p.readiness;
  if (r.reason === "belt_change") return `${r.nextStep} — your call.`;
  const status =
    r.status === "ready"
      ? "Ready for "
      : r.status === "close"
        ? "Close to "
        : r.status === "not_yet"
          ? "Working towards "
          : "Next: ";
  const counts = [
    p.rule.classesPerStripe
      ? `${r.classesSince}/${p.rule.classesPerStripe} classes`
      : `${r.classesSince} classes`,
    r.monthsProgress !== null && p.rule.monthsPerStripe
      ? `${r.monthsSince}/${p.rule.monthsPerStripe} months`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  const since = p.lastIsInitial
    ? `since being added (${p.sinceLabel})`
    : `since last promotion (${p.sinceLabel})`;
  return `${status}${r.nextStep} — ${counts} ${since}.`;
}

function OverviewTab({
  member,
  latestInvite,
  consent,
  promotion,
}: {
  member: Member;
  latestInvite: Invite;
  consent: Consent;
  promotion: Promotion;
}) {
  const isClaimed = Boolean(member.user_id);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <InfoCard label="Email" value={member.email || "No email — no login"} />
      <InfoCard label="Phone" value={member.phone || "—"} />
      <InfoCard label="Emergency contact" value={member.emergency_contact_name || "—"} />
      <InfoCard label="Emergency phone" value={member.emergency_contact_phone || "—"} />
      <InfoCard label="Joined" value={format(new Date(member.join_date), "MMM d, yyyy")} />
      {promotion && member.active && promotion.readiness.nextStep ? (
        <InfoCard label="Next promotion" value={promotionSummary(promotion)} />
      ) : null}
      <InfoCard
        label="Account status"
        value={
          isClaimed
            ? "Claimed"
            : !member.email
              ? "No login (roster only)"
              : latestInvite
                ? new Date(latestInvite.expires_at) < new Date()
                  ? "Invite expired"
                  : "Invite sent, unclaimed"
                : "No invite sent yet"
        }
      />
      <InfoCard
        label="GDPR consent"
        value={
          consent?.data_storage_consent
            ? `Given ${consent.consented_at ? format(new Date(consent.consented_at), "MMM d, yyyy") : ""}`
            : "Not yet given"
        }
      />
      <InfoCard label="Notes" value={member.notes || "—"} />
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function AttendanceTab({ memberId, joinDate }: { memberId: string; joinDate: string }) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  // Unbounded (well, a generous cap) rather than the old last-50 — a
  // calendar month view needs whichever months have data, not just the
  // most recent 50 check-ins, and this is a small per-member dataset at
  // alpha scale (matches the "fetch broadly" approach already used in
  // src/lib/payments/overdue.ts and the dashboard's not-seen-30-days
  // computation).
  const { data, isLoading } = useQuery({
    queryKey: ["member-attendance", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("attendance")
        .select("checked_in_at, checked_in_by")
        .eq("member_id", memberId)
        .order("checked_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No attendance recorded yet"
        description="Check-ins will show up here once classes are set up and attendance is tracked."
      />
    );
  }

  // Per plan §7 ("Attendance (list + avg-per-week stats)") — weeks elapsed
  // since join_date, floored at 1 so a brand-new member's single check-in
  // doesn't produce a misleadingly huge per-week average.
  const weeksSinceJoin = Math.max(1, differenceInCalendarWeeks(new Date(), new Date(joinDate)));
  const avgPerWeek = (data.length / weeksSinceJoin).toFixed(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Average per week</p>
          <p className="text-2xl font-semibold">{avgPerWeek}</p>
        </div>
        <div className="flex gap-1">
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            className="h-11"
            onClick={() => setView("calendar")}
          >
            Calendar
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            className="h-11"
            onClick={() => setView("list")}
          >
            List
          </Button>
        </div>
      </div>

      {view === "calendar" ? (
        <AttendanceCalendar
          entries={data.map((row) => ({
            checkedInAt: row.checked_in_at,
            checkedInBy: row.checked_in_by,
          }))}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((row, i) => (
            <li key={i} className="flex justify-between rounded-md border p-3 text-sm">
              <span>{format(new Date(row.checked_in_at), "EEE, MMM d, yyyy 'at' h:mm a")}</span>
              <span className="text-muted-foreground">
                {row.checked_in_by === "self"
                  ? "Self check-in"
                  : row.checked_in_by === "kiosk"
                    ? "Kiosk check-in"
                    : "Marked by coach"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PaymentsTab({
  billable,
  active,
  memberId,
  memberName,
  onPaymentChanged,
}: {
  billable: boolean;
  active: boolean;
  memberId: string;
  memberName: string;
  onPaymentChanged: () => void;
}) {
  // Flow audit 2.4: unpaid rows in a frozen month read "frozen", not overdue.
  const { data: holds, isLoading: holdsLoading } = useMemberHolds(memberId);
  const frozen = new Set((holds ?? []).flatMap(holdMonths));
  const [isMarking, setIsMarking] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<{
    month: number;
    year: number;
    existing: { status: PaymentStatus; amount: number | null; notes: string | null };
  } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["member-payments", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("period_month, period_year, status, amount, notes, paid_at")
        .eq("member_id", memberId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function markCurrentMonthPaid() {
    setIsMarking(true);
    try {
      const res = await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: [memberId] }),
      });
      if (res.ok) {
        toast.success("Marked paid for this month.");
        onPaymentChanged();
      } else {
        toast.error("Couldn't mark this payment.");
      }
    } finally {
      setIsMarking(false);
    }
  }

  // Wait for holds too, or a frozen unpaid month would flash "overdue".
  if (isLoading || holdsLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      {billable ? (
        <MembershipHolds memberId={memberId} memberName={memberName} canEdit={active} />
      ) : null}
      {billable ? (
        <Button
          variant="outline"
          className="h-11 w-fit"
          onClick={markCurrentMonthPaid}
          disabled={isMarking}
        >
          {isMarking ? "Marking..." : "Mark this month paid"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Coaches and casual (pay-per-class) members don&apos;t owe a monthly fee, so they
          aren&apos;t tracked here.
        </p>
      )}
      {!data || data.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payment history yet"
          description="This member's payments will list here as they're recorded — see the full gym-wide grid under Payments."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((row, i) => {
            // Rule 8: overdue is computed at query time, never stored — a
            // stored 'unpaid' row only reads as "Overdue" once its period
            // has actually ended, no grace period.
            const isFrozen =
              row.status === "unpaid" &&
              frozen.has(`${row.period_year}-${String(row.period_month).padStart(2, "0")}`);
            const overdue =
              !isFrozen &&
              isOverdue(row.status, {
                month: row.period_month,
                year: row.period_year,
              });
            const label = isFrozen ? "frozen" : overdue ? "overdue" : row.status;
            const periodLabel = format(
              new Date(row.period_year, row.period_month - 1),
              "MMMM yyyy",
            );
            return (
              <li key={i}>
                <button
                  type="button"
                  className="flex h-11 w-full items-center justify-between rounded-md border px-3 text-sm hover:bg-muted"
                  aria-label={`${periodLabel}: ${label} — edit`}
                  onClick={() =>
                    setSelectedPeriod({
                      month: row.period_month,
                      year: row.period_year,
                      existing: { status: row.status, amount: row.amount, notes: row.notes },
                    })
                  }
                >
                  <span>{periodLabel}</span>
                  <Badge
                    variant={
                      overdue
                        ? "destructive"
                        : isFrozen
                          ? "secondary"
                          : row.status === "paid"
                            ? "default"
                            : row.status === "waived"
                              ? "secondary"
                              : "outline"
                    }
                  >
                    {label}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <PaymentCellDialog
        open={selectedPeriod !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPeriod(null);
        }}
        memberName={memberName}
        memberId={memberId}
        periodMonth={selectedPeriod?.month ?? 1}
        periodYear={selectedPeriod?.year ?? new Date().getFullYear()}
        existing={selectedPeriod?.existing ?? null}
        onSaved={() => {
          setSelectedPeriod(null);
          onPaymentChanged();
        }}
      />
    </div>
  );
}

function BeltHistoryTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["member-belt-history", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("belt_history")
        .select("belt, stripes, promoted_at, notes, is_initial")
        .eq("member_id", memberId)
        .order("promoted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No promotions recorded yet"
        description="Belt promotions will appear here as a timeline."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <BeltDisplay belt={row.belt} stripes={row.stripes} size="sm" showLabel />
            <span className="text-xs text-muted-foreground">
              {format(new Date(row.promoted_at), "MMM d, yyyy")}
            </span>
          </div>
          {/* Stage O1: a starting-rank row (set when the member was added or
          imported) is not a promotion — labelled as such rather than
          showing its auto-generated note. */}
          {row.is_initial ? (
            <p className="text-sm text-muted-foreground">Starting rank when joined</p>
          ) : row.notes ? (
            <p className="text-sm text-muted-foreground">{row.notes}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// Stage A7: replaces the alpha's original mock prose-report stub
// (member.analyses) with the real computed profile (Stage A5) plus this
// member's actual logged breakdowns.
function AnalysisTab({ memberId }: { memberId: string }) {
  const {
    data: breakdowns,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["member-breakdowns", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id, name, match_date, gi, status")
        .eq("member_id", memberId)
        .order("match_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <ProfileView subject={{ type: "member", id: memberId }} />

      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">Breakdowns</h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : error ? (
          <p className="text-sm text-destructive">Couldn&apos;t load breakdowns. Try refreshing.</p>
        ) : !breakdowns || breakdowns.length === 0 ? (
          <EmptyState
            icon={Swords}
            title="No breakdowns yet"
            description="Matches logged about this member will show up here."
            actionLabel="Log a match"
            actionHref="/analysis/new"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {breakdowns.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/analysis/${b.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/50"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(b.match_date), "MMM d, yyyy")} · {b.gi ? "Gi" : "No-Gi"}
                    </span>
                  </div>
                  <Badge variant={b.status === "complete" ? "default" : "outline"}>
                    {b.status === "complete" ? "complete" : "in progress"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LogsTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["member-logs", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("athlete_logs")
        .select("entry_date, working_on, struggling_with, notes")
        .eq("member_id", memberId)
        .eq("visible_to_coach", true)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={NotebookText}
        title="No logs shared yet"
        description="Training logs this athlete marks visible to you will show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-md border p-3">
          <span className="text-xs text-muted-foreground">
            {format(new Date(row.entry_date), "MMM d, yyyy")}
          </span>
          {row.working_on ? <p className="text-sm">Working on: {row.working_on}</p> : null}
          {row.struggling_with ? (
            <p className="text-sm">Struggling with: {row.struggling_with}</p>
          ) : null}
          {row.notes ? <p className="text-sm text-muted-foreground">{row.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

// Flow audit 2.4: "On hold" in the profile header while a hold covers this
// month (gym calendar).
function OnHoldBadge({ memberId }: { memberId: string }) {
  const today = useGymToday();
  const { data: holds } = useMemberHolds(memberId);
  if (!today || !holds || !holdCovering(holds, today)) return null;
  return <Badge variant="secondary">On hold</Badge>;
}
