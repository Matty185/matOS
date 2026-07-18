"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, differenceInCalendarWeeks } from "date-fns";
import { CalendarCheck, CreditCard, Award, Video, NotebookText, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { PromoteBeltDialog } from "@/components/shared/promote-belt-dialog";
import { PLAN_LABELS } from "@/lib/constants/member-labels";
import { isOverdue } from "@/lib/payments/overdue";
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
import type { Database } from "@/types/database";

type Member = Database["public"]["Tables"]["members"]["Row"];
type Invite = { claimed_at: string | null; expires_at: string } | null;
type Consent = { data_storage_consent: boolean; consented_at: string | null } | null;

export function MemberProfileClient({
  member,
  latestInvite,
  consent,
}: {
  member: Member;
  latestInvite: Invite;
  consent: Consent;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isResending, setIsResending] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  async function handleResendInvite() {
    setIsResending(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success("Invite resent.");
        router.refresh();
      } else {
        toast.error(body.error ?? "Couldn't resend the invite.");
      }
    } finally {
      setIsResending(false);
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
          {!isClaimed ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={handleResendInvite}
              disabled={isResending}
            >
              {isResending
                ? "Sending..."
                : !latestInvite
                  ? "Send invite"
                  : inviteExpired
                    ? "Resend invite (expired)"
                    : "Resend invite"}
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
                    They&apos;ll no longer be able to sign in or be marked present at classes. This
                    can be undone later — members are deactivated, never deleted.
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
          ) : null}
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

        <TabsContent value="overview" className="pt-4">
          <OverviewTab member={member} latestInvite={latestInvite} consent={consent} />
        </TabsContent>
        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab memberId={member.id} joinDate={member.join_date} />
        </TabsContent>
        <TabsContent value="payments" className="pt-4">
          <PaymentsTab
            memberId={member.id}
            onMarkedPaid={() =>
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

function OverviewTab({
  member,
  latestInvite,
  consent,
}: {
  member: Member;
  latestInvite: Invite;
  consent: Consent;
}) {
  const isClaimed = Boolean(member.user_id);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <InfoCard label="Email" value={member.email} />
      <InfoCard label="Phone" value={member.phone || "—"} />
      <InfoCard label="Emergency contact" value={member.emergency_contact_name || "—"} />
      <InfoCard label="Emergency phone" value={member.emergency_contact_phone || "—"} />
      <InfoCard label="Joined" value={format(new Date(member.join_date), "MMM d, yyyy")} />
      <InfoCard
        label="Account status"
        value={
          isClaimed
            ? "Claimed"
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
  const { data, isLoading } = useQuery({
    queryKey: ["member-attendance", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("attendance")
        .select("checked_in_at, checked_in_by")
        .eq("member_id", memberId)
        .order("checked_in_at", { ascending: false })
        .limit(50);
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
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Average per week</p>
        <p className="text-2xl font-semibold">{avgPerWeek}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {data.map((row, i) => (
          <li key={i} className="flex justify-between rounded-md border p-3 text-sm">
            <span>{format(new Date(row.checked_in_at), "EEE, MMM d, yyyy 'at' h:mm a")}</span>
            <span className="text-muted-foreground">
              {row.checked_in_by === "self" ? "Self check-in" : "Marked by coach"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentsTab({ memberId, onMarkedPaid }: { memberId: string; onMarkedPaid: () => void }) {
  const [isMarking, setIsMarking] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["member-payments", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("period_month, period_year, status, amount, paid_at")
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
        onMarkedPaid();
      } else {
        toast.error("Couldn't mark this payment.");
      }
    } finally {
      setIsMarking(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="outline"
        className="h-11 w-fit"
        onClick={markCurrentMonthPaid}
        disabled={isMarking}
      >
        {isMarking ? "Marking..." : "Mark this month paid"}
      </Button>
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
            const overdue = isOverdue(row.status, {
              month: row.period_month,
              year: row.period_year,
            });
            const label = overdue ? "overdue" : row.status;
            return (
              <li key={i} className="flex justify-between rounded-md border p-3 text-sm">
                <span>{format(new Date(row.period_year, row.period_month - 1), "MMMM yyyy")}</span>
                <Badge
                  variant={
                    overdue
                      ? "destructive"
                      : row.status === "paid"
                        ? "default"
                        : row.status === "waived"
                          ? "secondary"
                          : "outline"
                  }
                >
                  {label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
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
        .select("belt, stripes, promoted_at, notes")
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
          {row.notes ? <p className="text-sm text-muted-foreground">{row.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function AnalysisTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["member-analyses", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("analyses")
        .select("title, status, analysed_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No analyses yet"
        description="Video analysis reports this member uploads will show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, i) => (
        <li key={i} className="flex justify-between rounded-md border p-3 text-sm">
          <span>{row.title}</span>
          <Badge variant="outline">{row.status}</Badge>
        </li>
      ))}
    </ul>
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
