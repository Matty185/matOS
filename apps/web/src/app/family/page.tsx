"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Baby, CheckCircle2, FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGymToday } from "@/hooks/use-gym-today";
import { fetchCurrentWaiver } from "@/lib/waivers";
import { getPaymentsTrackedFrom } from "@/lib/payments/tracked-from";
import { summariseAthletePayments } from "@/lib/payments/athlete-status";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { MembershipStatusCard } from "@/components/shared/membership-status-card";
import { WaiverText } from "@/components/shared/waiver-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addDaysToDate,
  formatClassTime,
  sessionRuns,
  sessionsOnDate,
  type ClassSession,
  type Database,
  type SessionChange,
} from "@matos/shared";

type Child = Pick<
  Database["public"]["Tables"]["members"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "belt"
  | "stripes"
  | "active"
  | "join_date"
  | "role"
  | "membership_plan"
> & { plan: { name: string } | null };

// Flow audit 8.2: a parent's linked children. Everything here is read under
// RLS as the parent (guardian policies on members, attendance, belt history,
// payments, holds, waiver signatures); payment amounts are never selected.
export default function FamilyPage() {
  const {
    data: children,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["family-children"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: current } = await supabase.rpc("current_member");
      const me = current?.[0];
      if (!me) throw new Error("No member");
      const { data: links, error: linkError } = await supabase
        .from("member_guardians")
        .select("child_member_id")
        .eq("guardian_member_id", me.id);
      if (linkError) throw linkError;
      const ids = (links ?? []).map((l) => l.child_member_id);
      if (ids.length === 0) return [] as Child[];
      const { data: kids, error: kidError } = await supabase
        .from("members")
        .select(
          "id, first_name, last_name, belt, stripes, active, join_date, role, membership_plan, plan:gym_plans(name)",
        )
        .in("id", ids)
        .order("first_name");
      if (kidError) throw kidError;
      return (kids ?? []) as Child[];
    },
  });

  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-3xl tracking-wide">Family</h1>
      <p className="text-sm text-muted-foreground">
        Check your children in, sign their waiver, and see how they&apos;re getting on.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-destructive">Couldn&apos;t load your family. Try refreshing.</p>
      </div>
    );
  }
  if (!children || children.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={Baby}
          title="No children linked yet"
          description="Ask your gym to link your child to your account from their profile."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {children.map((child) => (
        <ChildCard key={child.id} child={child} />
      ))}
    </div>
  );
}

type Shared = {
  sessions: ClassSession<Database["public"]["Tables"]["classes"]["Row"]>[];
  trackedFrom: string | null;
  waiver: Awaited<ReturnType<typeof fetchCurrentWaiver>>;
};

// What's the same for every child (today's sessions, the gym's tracking
// start, the current waiver): loaded once, not once per child.
function useFamilyShared(today: string | null) {
  return useQuery({
    queryKey: ["family-shared", today],
    enabled: !!today,
    queryFn: async (): Promise<Shared> => {
      const supabase = createClient();
      const date = today!;
      const [classesRes, changesRes, trackedFrom, waiver] = await Promise.all([
        supabase.from("classes").select("*").eq("active", true),
        supabase
          .from("class_session_changes")
          .select("id, class_id, session_date, kind, new_date, new_start_time, note")
          .gte("session_date", addDaysToDate(date, -6))
          .lte("session_date", addDaysToDate(date, 6)),
        getPaymentsTrackedFrom(supabase),
        fetchCurrentWaiver(supabase),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (changesRes.error) throw changesRes.error;
      return {
        sessions: sessionsOnDate(
          classesRes.data ?? [],
          (changesRes.data ?? []) as SessionChange[],
          date,
        ).filter((s) => sessionRuns(s.status)),
        trackedFrom,
        waiver,
      };
    },
  });
}

function ChildCard({ child }: { child: Child }) {
  const today = useGymToday();
  const queryClient = useQueryClient();
  const [busyClass, setBusyClass] = useState<string | null>(null);
  const shared = useFamilyShared(today);

  const {
    data: own,
    isLoading: ownLoading,
    error: ownError,
  } = useQuery({
    queryKey: ["family-child", child.id, today, shared.data?.waiver?.id ?? null],
    enabled: !!today && !!shared.data,
    queryFn: async () => {
      const supabase = createClient();
      const date = today!;
      const waiver = shared.data!.waiver;
      const [todayRes, recentRes, paymentsRes, holdsRes, sigRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("class_id")
          .eq("member_id", child.id)
          .eq("checked_in_date", date),
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("member_id", child.id)
          .gte("checked_in_date", addDaysToDate(date, -30)),
        // Never `amount` (CLAUDE.md Rule 3).
        supabase
          .from("payments")
          .select("period_month, period_year, status")
          .eq("member_id", child.id),
        supabase
          .from("membership_holds")
          .select("member_id, start_month, end_month")
          .eq("member_id", child.id),
        waiver
          ? supabase
              .from("waiver_signatures")
              .select("id")
              .eq("member_id", child.id)
              .eq("waiver_version_id", waiver.id)
              .is("voided_at", null)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [todayRes, recentRes, paymentsRes, holdsRes, sigRes]) {
        if (r.error) throw r.error;
      }
      return {
        checkedIn: new Set((todayRes.data ?? []).map((a) => a.class_id)),
        lastMonth: recentRes.count ?? 0,
        summary: summariseAthletePayments(
          child,
          paymentsRes.data ?? [],
          shared.data!.trackedFrom,
          date,
          holdsRes.data ?? [],
        ),
        waiver: waiver && !sigRes.data ? waiver : null,
      };
    },
  });
  const isLoading = shared.isLoading || ownLoading;
  const error = shared.error ?? ownError;
  const data = own && shared.data ? { ...own, sessions: shared.data.sessions } : undefined;

  async function checkIn(classId: string) {
    setBusyClass(classId);
    try {
      const res = await fetch("/api/family/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: child.id, class_id: classId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't check in.");
        return;
      }
      toast.success(`${child.first_name} is checked in.`);
      queryClient.invalidateQueries({ queryKey: ["family-child", child.id] });
    } finally {
      setBusyClass(null);
    }
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-md border p-4"
      aria-labelledby={`child-${child.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={`child-${child.id}`} className="text-lg font-medium">
            {child.first_name} {child.last_name}
          </h2>
          <BeltDisplay belt={child.belt} stripes={child.stripes} size="sm" showLabel />
        </div>
        {!child.active ? <Badge variant="secondary">Inactive</Badge> : null}
      </div>

      {isLoading || !today ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error || !data ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load {child.first_name}&apos;s details.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.lastMonth === 1 ? "1 class" : `${data.lastMonth} classes`} in the last 30 days.
          </p>

          {data.waiver ? (
            <GuardianWaiverForm
              childId={child.id}
              childName={child.first_name}
              waiver={data.waiver}
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Today&apos;s classes</h3>
            {!child.active ? (
              <p className="text-sm text-muted-foreground">
                Check-in is off while {child.first_name}&apos;s membership is inactive.
              </p>
            ) : data.sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes today.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.sessions.map((s) => {
                  const done = data.checkedIn.has(s.classRow.id);
                  return (
                    <li
                      key={s.classRow.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <span className="text-sm">
                        <span className="font-medium">{formatClassTime(s.startTime)}</span>{" "}
                        {s.classRow.name}
                      </span>
                      {done ? (
                        <Badge className="flex h-11 items-center gap-1.5 px-3">
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> Checked in
                        </Badge>
                      ) : (
                        <Button
                          className="h-11"
                          onClick={() => checkIn(s.classRow.id)}
                          disabled={busyClass === s.classRow.id}
                          aria-label={`Check ${child.first_name} in to ${s.classRow.name}`}
                        >
                          {busyClass === s.classRow.id ? "Checking in..." : "Check in"}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Check-in opens 30 minutes before a class and closes when it ends.
            </p>
          </div>

          <MembershipStatusCard
            plan={child.membership_plan}
            planName={child.plan?.name}
            summary={data.summary}
            childName={child.first_name}
          />
        </>
      )}
    </section>
  );
}

function GuardianWaiverForm({
  childId,
  childName,
  waiver,
}: {
  childId: string;
  childName: string;
  waiver: { id: string; version: number; body: string };
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  async function sign() {
    setSaving(true);
    try {
      const res = await fetch("/api/family/waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: childId,
          waiver_version_id: waiver.id,
          signer_name: name,
          agree,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't sign the waiver.");
        return;
      }
      toast.success(`Waiver signed for ${childName}.`);
      queryClient.invalidateQueries({ queryKey: ["family-child", childId] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <FileSignature className="h-4 w-4 text-primary" aria-hidden />
          Please sign the gym&apos;s waiver for {childName}
        </span>
        {!open ? (
          <Button className="h-11" onClick={() => setOpen(true)}>
            Read and sign
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && agree) void sign();
          }}
        >
          <WaiverText body={waiver.body} version={waiver.version} />
          <div className="flex flex-col gap-2">
            <Label htmlFor={`gw-name-${childId}`}>Your full name</Label>
            <Input
              id={`gw-name-${childId}`}
              className="h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id={`gw-agree-${childId}`}
              className="mt-0.5 h-5 w-5"
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
            />
            <Label htmlFor={`gw-agree-${childId}`} className="font-normal leading-snug">
              I am {childName}&apos;s parent or guardian. I have read and agree to this waiver on
              their behalf.
            </Label>
          </div>
          <Button
            type="submit"
            className="h-11 w-full sm:w-fit"
            disabled={name.trim().length < 2 || !agree || saving}
          >
            {saving ? "Signing..." : "Sign waiver"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
