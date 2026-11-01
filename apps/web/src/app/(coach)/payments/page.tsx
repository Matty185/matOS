"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { format, parseISO, startOfMonth } from "date-fns";
import { CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentCellDialog } from "@/components/shared/payment-cell-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  trailingMonthWindow,
  isOverdue,
  periodKey,
  getOverdueMemberIds,
  billableMembers,
  type PaymentStatus,
  type MonthPeriod,
} from "@/lib/payments/overdue";
import { getPaymentsTrackedFrom } from "@/lib/payments/tracked-from";

type MemberRow = { id: string; first_name: string; last_name: string; join_date: string };
type PaymentRow = {
  member_id: string;
  period_month: number;
  period_year: number;
  status: PaymentStatus;
  amount: number | null;
  notes: string | null;
};

const WINDOW_LENGTH = 6;

export default function PaymentsPage() {
  const [monthsBack, setMonthsBack] = useState(0);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState<{ member: MemberRow; period: MonthPeriod } | null>(null);
  const queryClient = useQueryClient();

  const monthWindow = useMemo(() => trailingMonthWindow(WINDOW_LENGTH, monthsBack), [monthsBack]);
  const minYear = monthWindow[0]!.year;
  const maxYear = monthWindow[monthWindow.length - 1]!.year;

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["payments-members"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, join_date, role")
        .eq("active", true)
        .order("last_name", { ascending: true });
      if (error) throw error;
      // Owner excluded and each member's first billable month clamped to
      // when MatOS started tracking this gym's payments (Stage O6) — the
      // grid renders "—" before that, exactly like before a member joined.
      return billableMembers(data as MemberRow[], await getPaymentsTrackedFrom(supabase));
    },
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payments-grid", minYear, maxYear],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("member_id, period_month, period_year, status, amount, notes")
        .gte("period_year", minYear)
        .lte("period_year", maxYear)
        .order("member_id", { ascending: true })
        .order("period_year", { ascending: true })
        .order("period_month", { ascending: true });
      if (error) throw error;
      return data as PaymentRow[];
    },
    // Keep the previous window's rows on screen while a newly-visited
    // window loads, instead of the whole grid (including the Prev/Next
    // buttons themselves) disappearing behind "Loading payments..." on
    // every month-navigation click.
    placeholderData: keepPreviousData,
  });

  // Keyed by member+period so PaymentCellDialog's resync effect sees a
  // stable object reference across re-renders (only changes when the query
  // actually refetches), not a fresh literal every render.
  const paymentsByKey = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    for (const p of payments ?? []) {
      map.set(periodKey(p.member_id, { month: p.period_month, year: p.period_year }), p);
    }
    return map;
  }, [payments]);

  const overdueMemberIds = useMemo(
    () => getOverdueMemberIds(members ?? [], payments ?? [], monthWindow),
    [members, payments, monthWindow],
  );

  const visibleMembers = useMemo(() => {
    if (!members) return [];
    return overdueOnly ? members.filter((m) => overdueMemberIds.has(m.id)) : members;
  }, [members, overdueOnly, overdueMemberIds]);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["payments-grid"] });
  }

  const isLoading = membersLoading || paymentsLoading;
  const existingForSelected = selected
    ? (paymentsByKey.get(periodKey(selected.member.id, selected.period)) ?? null)
    : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Payments</h1>
        <p className="text-sm text-muted-foreground">Loading payments...</p>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Payments</h1>
        <EmptyState
          icon={CreditCard}
          title="No members yet"
          description="Once you add members, their monthly payment status will show up here."
          actionLabel="Add a member"
          actionHref="/members/new"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Payments</h1>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11 w-11 p-0"
            aria-label="Earlier months"
            onClick={() => setMonthsBack((v) => v + WINDOW_LENGTH)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {format(new Date(monthWindow[0]!.year, monthWindow[0]!.month - 1), "MMM yyyy")} –{" "}
            {format(
              new Date(
                monthWindow[WINDOW_LENGTH - 1]!.year,
                monthWindow[WINDOW_LENGTH - 1]!.month - 1,
              ),
              "MMM yyyy",
            )}
          </span>
          <Button
            variant="outline"
            className="h-11 w-11 p-0"
            aria-label="Later months"
            disabled={monthsBack === 0}
            onClick={() => setMonthsBack((v) => Math.max(0, v - WINDOW_LENGTH))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex h-11 items-center gap-2 text-sm">
          <Checkbox
            id="overdue-only"
            checked={overdueOnly}
            onCheckedChange={(c) => setOverdueOnly(c === true)}
          />
          <Label htmlFor="overdue-only" className="font-normal">
            Show overdue only {overdueMemberIds.size > 0 ? `(${overdueMemberIds.size})` : ""}
          </Label>
        </div>
      </div>

      {overdueMemberIds.size > 0 ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
          <span className="font-medium text-destructive">{overdueMemberIds.size}</span>{" "}
          {overdueMemberIds.size === 1 ? "member is" : "members are"} overdue within this window.
        </div>
      ) : null}

      {visibleMembers.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No overdue members"
          description="Every active member is paid up or waived for this window."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              {monthWindow.map((period) => (
                <TableHead key={`${period.year}-${period.month}`} className="text-center">
                  {format(new Date(period.year, period.month - 1), "MMM yyyy")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleMembers.map((member) => {
              const joinMonth = startOfMonth(parseISO(member.join_date));
              return (
                <TableRow key={member.id}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {member.first_name} {member.last_name}
                  </TableCell>
                  {monthWindow.map((period) => {
                    const periodStart = new Date(period.year, period.month - 1, 1);
                    const notYetMember = periodStart < joinMonth;
                    const key = `${member.id}-${period.year}-${period.month}`;

                    if (notYetMember) {
                      return (
                        <TableCell key={key} className="text-center text-muted-foreground">
                          —
                        </TableCell>
                      );
                    }

                    const row = paymentsByKey.get(periodKey(member.id, period));
                    const status: PaymentStatus = row?.status ?? "unpaid";
                    const overdue = isOverdue(status, period);
                    const label = overdue
                      ? "Overdue"
                      : status === "paid"
                        ? "Paid"
                        : status === "waived"
                          ? "Waived"
                          : "Unpaid";
                    const variant = overdue
                      ? "destructive"
                      : status === "paid"
                        ? "default"
                        : status === "waived"
                          ? "secondary"
                          : "outline";

                    const periodLabel = format(
                      new Date(period.year, period.month - 1),
                      "MMMM yyyy",
                    );

                    return (
                      <TableCell key={key} className="text-center">
                        <button
                          type="button"
                          className="flex h-11 w-full items-center justify-center rounded-md"
                          aria-label={`${member.first_name} ${member.last_name}, ${periodLabel}: ${label}`}
                          onClick={() => setSelected({ member, period })}
                        >
                          <Badge variant={variant}>{label}</Badge>
                        </button>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <PaymentCellDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        memberName={selected ? `${selected.member.first_name} ${selected.member.last_name}` : ""}
        memberId={selected?.member.id ?? ""}
        periodMonth={selected?.period.month ?? 1}
        periodYear={selected?.period.year ?? new Date().getFullYear()}
        existing={existingForSelected}
        onSaved={refetch}
      />
    </div>
  );
}
