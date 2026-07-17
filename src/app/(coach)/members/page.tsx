"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BeltDisplay, ALL_BELTS, BELT_LABELS } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { PLAN_LABELS } from "@/lib/constants/member-labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Database } from "@/types/database";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type MembershipPlan = Database["public"]["Enums"]["membership_plan"];

// Every belt in the enum, per plan §3 ("kids belts... appear in the same
// member list") — the filter previously only listed adult belts.
const BELT_FILTER_OPTIONS = [
  { value: "all", label: "All belts" },
  ...ALL_BELTS.map((value) => ({ value, label: BELT_LABELS[value] })),
];

const PLAN_FILTER_OPTIONS: { value: "all" | MembershipPlan; label: string }[] = [
  { value: "all", label: "All plans" },
  { value: "monthly", label: "Monthly" },
  { value: "casual", label: "Casual" },
  { value: "comp_team", label: "Comp Team" },
];

const PAYMENT_FILTER_OPTIONS: { value: "all" | PaymentStatus | "no_record"; label: string }[] = [
  { value: "all", label: "All payment status" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "waived", label: "Waived" },
  { value: "no_record", label: "No record" },
];

function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .order("last_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useCurrentPeriodPayments() {
  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();

  return useQuery({
    queryKey: ["payments", "current-period", periodMonth, periodYear],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("payments")
        .select("member_id, status")
        .eq("period_month", periodMonth)
        .eq("period_year", periodYear);
      if (error) throw error;
      const map = new Map<string, PaymentStatus>();
      for (const row of data) map.set(row.member_id, row.status);
      return map;
    },
  });
}

function PaymentBadge({
  status,
  isLoading,
}: {
  status: PaymentStatus | "no_record";
  isLoading: boolean;
}) {
  if (isLoading) return <Badge variant="outline">—</Badge>;
  if (status === "paid") return <Badge>Paid</Badge>;
  if (status === "waived") return <Badge variant="secondary">Waived</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export default function MembersPage() {
  const { data: members, isLoading, error } = useMembers();
  const {
    data: payments,
    isLoading: paymentsLoading,
    isError: paymentsError,
  } = useCurrentPeriodPayments();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [beltFilter, setBeltFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState<"all" | MembershipPlan>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus | "no_record">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const filtered = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => {
      if (!showInactive && !m.active) return false;
      if (beltFilter !== "all" && !m.belt.startsWith(beltFilter)) return false;
      if (planFilter !== "all" && m.membership_plan !== planFilter) return false;
      if (paymentFilter !== "all") {
        const status = payments?.get(m.id) ?? "no_record";
        if (status !== paymentFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = `${m.first_name} ${m.last_name}`.toLowerCase();
        if (!name.includes(q) && !m.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [members, search, beltFilter, planFilter, paymentFilter, showInactive, payments]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkMarkPaid() {
    if (selected.size === 0) return;
    setIsMarkingPaid(true);
    try {
      const res = await fetch("/api/payments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_ids: Array.from(selected) }),
      });
      const body = await res.json();
      if (res.ok) {
        toast.success(`Marked ${selected.size} member${selected.size === 1 ? "" : "s"} paid.`);
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: ["payments", "current-period"] });
      } else {
        toast.error(body.error ?? "Couldn't mark payments — try again.");
      }
    } catch {
      toast.error("Couldn't mark payments — try again.");
    } finally {
      setIsMarkingPaid(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Members</h1>
        <p className="text-sm text-muted-foreground">Loading members...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Members</h1>
        <p className="text-sm text-destructive">Couldn&apos;t load members. Try refreshing.</p>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Members</h1>
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Add your first member to get started — they'll get an invite email automatically."
          actionLabel="Add member"
          actionHref="/members/new"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl tracking-wide">Members</h1>
        <Button asChild className="h-11">
          <Link href="/members/new">Add member</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 max-w-xs"
        />
        <Select value={beltFilter} onValueChange={setBeltFilter}>
          <SelectTrigger className="h-11 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BELT_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as typeof planFilter)}>
          <SelectTrigger className="h-11 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAN_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={paymentFilter}
          onValueChange={(v) => setPaymentFilter(v as typeof paymentFilter)}
        >
          <SelectTrigger className="h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex h-11 items-center gap-2 text-sm">
          <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(c === true)} />
          Show inactive
        </label>
        {selected.size > 0 ? (
          <Button
            variant="secondary"
            className="h-11"
            onClick={handleBulkMarkPaid}
            disabled={isMarkingPaid}
          >
            {isMarkingPaid ? "Marking..." : `Mark ${selected.size} paid (this month)`}
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members match"
          description="Try a different search or filter."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Name</TableHead>
                <TableHead>Belt</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex h-11 w-11 items-center justify-center">
                      <Checkbox
                        checked={selected.has(member.id)}
                        onCheckedChange={() => toggleSelected(member.id)}
                        aria-label={`Select ${member.first_name} ${member.last_name}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/members/${member.id}`} className="font-medium hover:underline">
                      {member.first_name} {member.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <BeltDisplay belt={member.belt} stripes={member.stripes} size="sm" />
                  </TableCell>
                  <TableCell>{PLAN_LABELS[member.membership_plan]}</TableCell>
                  <TableCell>
                    <PaymentBadge
                      status={
                        paymentsError ? "no_record" : (payments?.get(member.id) ?? "no_record")
                      }
                      isLoading={paymentsLoading}
                    />
                  </TableCell>
                  <TableCell>
                    {member.active ? (
                      <Badge variant="outline">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
