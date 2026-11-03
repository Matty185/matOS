"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BeltDisplay, ALL_BELTS, BELT_LABELS } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { PaymentCellDialog } from "@/components/shared/payment-cell-dialog";
import { BulkInviteDialog } from "@/components/shared/bulk-invite-dialog";
import { SignupLinkDialog } from "@/components/shared/signup-link-dialog";
import { PLAN_LABELS } from "@/lib/constants/member-labels";
import { isBillable } from "@/lib/payments/overdue";
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
import type { Database } from "@matos/shared";
import { useMembersOnHold } from "@/hooks/use-members-on-hold";
import { useWaiverStatus } from "@/hooks/use-waiver-status";

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

// Stage O4: where each member is in getting onto MatOS.
type SignupStatus = "joined" | "invited" | "expired" | "not_invited" | "no_login";

const SIGNUP_FILTER_OPTIONS: { value: "all" | SignupStatus; label: string }[] = [
  { value: "all", label: "All sign-up status" },
  { value: "not_invited", label: "Not invited" },
  { value: "invited", label: "Invited" },
  { value: "expired", label: "Invite expired" },
  { value: "joined", label: "Joined" },
  { value: "no_login", label: "No email (no login)" },
];

function useLatestInvites() {
  return useQuery({
    queryKey: ["invites", "latest"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invites")
        .select("member_id, claimed_at, expires_at, created_at")
        // "Joined" comes from members.user_id, so claimed invites are
        // irrelevant here; dropping them keeps this well under PostgREST's
        // 1000-row cap even after several rounds of re-sent links.
        .is("claimed_at", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      // Newest first, so the first row seen per member is their latest.
      const map = new Map<string, { claimed_at: string | null; expires_at: string }>();
      for (const row of data) if (!map.has(row.member_id)) map.set(row.member_id, row);
      return map;
    },
  });
}

function signupStatus(
  member: { user_id: string | null; email: string | null },
  invite: { claimed_at: string | null; expires_at: string } | undefined,
): SignupStatus {
  if (member.user_id) return "joined";
  if (!member.email) return "no_login";
  if (!invite) return "not_invited";
  return new Date(invite.expires_at) < new Date() ? "expired" : "invited";
}

function SignupBadge({ status }: { status: SignupStatus }) {
  if (status === "joined") return <Badge variant="outline">Joined</Badge>;
  if (status === "invited") return <Badge variant="secondary">Invited</Badge>;
  if (status === "expired") return <Badge variant="destructive">Invite expired</Badge>;
  if (status === "no_login") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No login
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-dashed text-muted-foreground">
      Not invited
    </Badge>
  );
}

type CurrentPeriodPayment = { status: PaymentStatus; amount: number | null; notes: string | null };

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
        .select("member_id, status, amount, notes")
        .eq("period_month", periodMonth)
        .eq("period_year", periodYear);
      if (error) throw error;
      const map = new Map<string, CurrentPeriodPayment>();
      for (const row of data) {
        map.set(row.member_id, { status: row.status, amount: row.amount, notes: row.notes });
      }
      return map;
    },
  });
}

function PaymentBadge({
  status,
  isLoading,
  frozen,
}: {
  status: PaymentStatus | "no_record";
  isLoading: boolean;
  /** Flow audit 2.4: on hold this month, so nothing is owed. */
  frozen: boolean;
}) {
  if (isLoading) return <Badge variant="outline">—</Badge>;
  if (status === "paid") return <Badge>Paid</Badge>;
  if (status === "waived") return <Badge variant="secondary">Waived</Badge>;
  if (frozen) return <Badge variant="secondary">Frozen</Badge>;
  return <Badge variant="destructive">Unpaid</Badge>;
}

export default function MembersPage() {
  const { ids: onHold, isLoading: holdsLoading } = useMembersOnHold();
  // Flow audit 9.3.
  const waiverStatus = useWaiverStatus();
  const { data: members, isLoading, error } = useMembers();
  const {
    data: payments,
    isLoading: paymentsLoading,
    isError: paymentsError,
  } = useCurrentPeriodPayments();
  const queryClient = useQueryClient();
  const { data: invites } = useLatestInvites();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [waiverMissingOnly, setWaiverMissingOnly] = useState(
    () => searchParams.get("waiver") === "missing",
  );
  const [signupFilter, setSignupFilter] = useState<"all" | SignupStatus>(() => {
    const fromUrl = searchParams.get("invite");
    return SIGNUP_FILTER_OPTIONS.some((o) => o.value === fromUrl)
      ? (fromUrl as SignupStatus)
      : "all";
  });
  const [bulkInviteIds, setBulkInviteIds] = useState<string[] | null>(null);
  const [signupLinkOpen, setSignupLinkOpen] = useState(false);
  const [beltFilter, setBeltFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState<"all" | MembershipPlan>("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentStatus | "no_record">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentDialogMember, setPaymentDialogMember] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const now = new Date();
  const currentPeriodMonth = now.getMonth() + 1;
  const currentPeriodYear = now.getFullYear();

  const filtered = useMemo(() => {
    if (!members) return [];
    return members.filter((m) => {
      if (!showInactive && !m.active) return false;
      // Applied once the status is known (and only if the gym has a waiver),
      // so ?waiver=missing never shows an empty list while loading.
      if (
        waiverMissingOnly &&
        !waiverStatus.isLoading &&
        waiverStatus.waiver &&
        !waiverStatus.missing(m)
      ) {
        return false;
      }
      if (beltFilter !== "all" && !m.belt.startsWith(beltFilter)) return false;
      if (planFilter !== "all" && m.membership_plan !== planFilter) return false;
      if (signupFilter !== "all" && signupStatus(m, invites?.get(m.id)) !== signupFilter) {
        return false;
      }
      if (paymentFilter !== "all") {
        if (!isBillable(m)) return false;
        const status = payments?.get(m.id)?.status ?? "no_record";
        // A member on hold owes nothing this month, so isn't "unpaid".
        if (onHold.has(m.id) && status !== "paid" && status !== "waived") return false;
        if (status !== paymentFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = `${m.first_name} ${m.last_name}`.toLowerCase();
        if (!name.includes(q) && !(m.email ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [
    members,
    onHold,
    waiverMissingOnly,
    waiverStatus,
    search,
    beltFilter,
    planFilter,
    paymentFilter,
    signupFilter,
    showInactive,
    payments,
    invites,
  ]);

  // Selected members who can actually be invited (active, not yet joined,
  // and with an email to sign in with).
  const invitableSelected = useMemo(
    () =>
      (members ?? [])
        .filter((m) => selected.has(m.id) && m.active && !m.user_id && !!m.email)
        .map((m) => m.id),
    [members, selected],
  );

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
        // Only members who owe a monthly fee (isBillable) — never staff or casual.
        body: JSON.stringify({
          member_ids: Array.from(selected).filter((id) => {
            const m = members?.find((x) => x.id === id);
            return !!m && isBillable(m);
          }),
        }),
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
          description="Import your whole roster at once — paste a list or upload a spreadsheet, with everyone's current belt."
          actionLabel="Import members"
          actionHref="/members/import"
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="link" className="h-11">
            <Link href="/members/new">Or add one person</Link>
          </Button>
          <Button variant="link" className="h-11" onClick={() => setSignupLinkOpen(true)}>
            Or send a sign-up link
          </Button>
        </div>
        <SignupLinkDialog
          open={signupLinkOpen}
          onOpenChange={(open) => {
            setSignupLinkOpen(open);
            // Someone may have signed up while it was open.
            if (!open) void queryClient.invalidateQueries({ queryKey: ["members"] });
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl tracking-wide">Members</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setSignupLinkOpen(true)}>
            Sign-up link
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link href="/members/import">Import</Link>
          </Button>
          <Button asChild className="h-11">
            <Link href="/members/new">Add member</Link>
          </Button>
        </div>
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
        <Select
          value={signupFilter}
          onValueChange={(v) => setSignupFilter(v as typeof signupFilter)}
        >
          <SelectTrigger className="h-11 w-44" aria-label="Filter by sign-up status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIGNUP_FILTER_OPTIONS.map((opt) => (
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
        {waiverStatus.waiver ? (
          <label className="flex h-11 items-center gap-2 text-sm">
            <Checkbox
              checked={waiverMissingOnly}
              onCheckedChange={(c) => setWaiverMissingOnly(c === true)}
            />
            Waiver not signed
          </label>
        ) : null}
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
        {invitableSelected.length > 0 ? (
          <Button
            className="h-11"
            onClick={() => setBulkInviteIds(invitableSelected.slice(0, 100))}
          >
            {invitableSelected.length > 100
              ? "Invite first 100"
              : `Invite ${invitableSelected.length}`}
          </Button>
        ) : null}
        {filtered.length > 0 ? (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() =>
              setSelected((prev) =>
                prev.size === filtered.length ? new Set() : new Set(filtered.map((m) => m.id)),
              )
            }
          >
            {selected.size === filtered.length
              ? "Clear selection"
              : `Select all ${filtered.length}`}
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
                <TableHead className="hidden md:table-cell">Plan</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Sign-up</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    {/* A plain wrapping div reserves 44x44 of visual space but
                    doesn't extend the actual click/tap hit area beyond the
                    16x16 checkbox itself — a <label> does, via native
                    implicit label-control association, with no visual
                    change and no extra JS. */}
                    <label className="flex h-11 w-11 items-center justify-center">
                      <Checkbox
                        checked={selected.has(member.id)}
                        onCheckedChange={() => toggleSelected(member.id)}
                        aria-label={`Select ${member.first_name} ${member.last_name}`}
                      />
                    </label>
                  </TableCell>
                  <TableCell>
                    {/* py-3/-my-3 grows the tap target to a full 44px without
                    shifting the row's visual layout (the negative margin
                    cancels the padding). */}
                    <Link
                      href={`/members/${member.id}`}
                      className="-my-3 block w-full py-3 font-medium hover:underline"
                    >
                      {member.first_name} {member.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <BeltDisplay belt={member.belt} stripes={member.stripes} size="sm" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {PLAN_LABELS[member.membership_plan]}
                  </TableCell>
                  <TableCell>
                    {!isBillable(member) ? (
                      // Staff and casual members don't owe a monthly fee
                      // (isBillable in lib/payments/overdue).
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <button
                        type="button"
                        className="flex h-11 w-full items-center rounded-md"
                        aria-label={`${member.first_name} ${member.last_name}'s payment status — edit`}
                        onClick={() =>
                          setPaymentDialogMember({
                            id: member.id,
                            name: `${member.first_name} ${member.last_name}`,
                          })
                        }
                      >
                        <PaymentBadge
                          status={
                            paymentsError
                              ? "no_record"
                              : (payments?.get(member.id)?.status ?? "no_record")
                          }
                          isLoading={paymentsLoading || holdsLoading}
                          frozen={onHold.has(member.id)}
                        />
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    <SignupBadge status={signupStatus(member, invites?.get(member.id))} />
                  </TableCell>
                  <TableCell>
                    {waiverStatus.missing(member) ? (
                      <Badge variant="destructive" className="mb-1 mr-1">
                        No waiver
                      </Badge>
                    ) : null}
                    {member.active ? (
                      onHold.has(member.id) ? (
                        // Flow audit 2.4.
                        <Badge variant="secondary">On hold</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )
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

      <SignupLinkDialog
        open={signupLinkOpen}
        onOpenChange={(open) => {
          setSignupLinkOpen(open);
          // Someone may have signed up while it was open.
          if (!open) void queryClient.invalidateQueries({ queryKey: ["members"] });
        }}
      />

      <BulkInviteDialog
        memberIds={bulkInviteIds ?? []}
        open={bulkInviteIds !== null}
        onOpenChange={(open) => {
          if (!open) setBulkInviteIds(null);
        }}
        onDone={() => {
          setSelected(new Set());
          void queryClient.invalidateQueries({ queryKey: ["invites", "latest"] });
        }}
      />

      <PaymentCellDialog
        open={paymentDialogMember !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentDialogMember(null);
        }}
        memberName={paymentDialogMember?.name ?? ""}
        memberId={paymentDialogMember?.id ?? ""}
        periodMonth={currentPeriodMonth}
        periodYear={currentPeriodYear}
        existing={paymentDialogMember ? (payments?.get(paymentDialogMember.id) ?? null) : null}
        onSaved={() => {
          setPaymentDialogMember(null);
          queryClient.invalidateQueries({ queryKey: ["payments", "current-period"] });
        }}
      />
    </div>
  );
}
