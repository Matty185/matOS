"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/payments/fees";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Outcomes a coach should look at (matches payment_events_needs_review_idx). */
export const NEEDS_REVIEW_OUTCOMES = [
  "already_paid",
  "failed",
  "unmatched",
  "not_billable",
  "amount_mismatch",
] as const;

type Outcome =
  | "recorded"
  | "class_payment"
  | "pending"
  | "test_payment"
  | (typeof NEEDS_REVIEW_OUTCOMES)[number];

type EventRow = {
  id: string;
  created_at: string;
  outcome: Outcome;
  livemode: boolean;
  period_month: number | null;
  period_year: number | null;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  payer_email: string | null;
  reviewed_at: string | null;
  member_id: string | null;
  members: { first_name: string; last_name: string } | null;
};

const SELECT =
  "id, created_at, outcome, livemode, period_month, period_year, amount, currency, reference, payer_email, reviewed_at, member_id, members(first_name, last_name)";

/** "Ana-Murphy_2026-11_3f2a9c1b" → "Ana Murphy, November 2026". */
function readableReference(ref: string): string {
  const m = /^([A-Za-z0-9-]+)_(\d{4})-(\d{2})_[0-9a-f]{8}$/.exec(ref);
  const c = /^([A-Za-z0-9-]+)_class_[0-9a-f]{8}$/.exec(ref);
  if (m) {
    const month = format(new Date(Number(m[2]), Number(m[3]) - 1), "MMMM yyyy");
    return `${m[1]!.replace(/-/g, " ")}, ${month}`;
  }
  if (c) return `${c[1]!.replace(/-/g, " ")}, a class`;
  return ref;
}

function monthLabel(e: EventRow): string | null {
  return e.period_month && e.period_year
    ? format(new Date(e.period_year, e.period_month - 1), "MMMM yyyy")
    : null;
}

function amountLabel(e: EventRow): string {
  if (e.amount === null) return "";
  if (e.currency && e.currency !== "eur")
    return `${e.amount.toFixed(2)} ${e.currency.toUpperCase()}`;
  return formatMoney(e.amount);
}

function who(e: EventRow): string {
  return e.members ? `${e.members.first_name} ${e.members.last_name}` : "Someone";
}

function explain(e: EventRow): string {
  const month = monthLabel(e);
  const amount = amountLabel(e);
  switch (e.outcome) {
    case "already_paid":
      return `Paid ${amount} online for ${month ?? "a month"} that was already paid or waived (or set back to unpaid), so nothing changed. They may have paid twice: refund it in Stripe, or mark another month paid on their profile.`;
    case "failed":
      return `The bank payment for ${month ?? "their membership"} failed. The month is still unpaid.`;
    case "unmatched": {
      const parts = [
        e.reference ? `the payment says "${readableReference(e.reference)}"` : null,
        e.payer_email ? `paid with ${e.payer_email}` : null,
      ].filter(Boolean);
      return `Paid ${amount}, but MatOS couldn't tell who it was for${
        parts.length ? ` (${parts.join(", ")})` : ""
      }. Find them and mark the month paid by hand.`;
    }
    case "not_billable":
      return `Paid ${amount}, but they don't owe a monthly fee (coach, parent or pay-per-class), so nothing was marked.`;
    case "amount_mismatch":
      return `Paid ${amount} for ${month ?? "a month"}, which MatOS couldn't check against their plan (less than the price, no price set on the plan, or not in euro), so the month wasn't marked. Mark it paid on their profile if that's right.`;
    case "test_payment":
      return `Test payment${amount ? ` of ${amount}` : ""}${month ? ` for ${month}` : ""}. Test payments never mark a month paid. Your setup works.`;
    case "recorded":
      return `${month ?? "Month"} marked paid${amount ? ` (${amount})` : ""}.`;
    case "class_payment":
      return `Paid for a class${amount ? ` (${amount})` : ""}.`;
    case "pending":
      return `Bank payment for ${month ?? "a month"} started. It's marked paid once it clears, usually within a few days.`;
  }
}

function useOnlinePayments() {
  return useQuery({
    queryKey: ["payment-events"],
    queryFn: async () => {
      const supabase = createClient();
      // Everything not yet checked (no date limit, so it always matches the
      // dashboard count), plus the latest few for "Recent".
      const [needs, recent] = await Promise.all([
        supabase
          .from("payment_events")
          .select(SELECT)
          .is("reviewed_at", null)
          .in("outcome", [...NEEDS_REVIEW_OUTCOMES])
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("payment_events")
          .select(SELECT)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (needs.error) throw needs.error;
      if (recent.error) throw recent.error;
      return {
        needs: needs.data as unknown as EventRow[],
        recent: recent.data as unknown as EventRow[],
      };
    },
  });
}

/**
 * Stage L2: online payments Stripe reported. Shows the ones a coach needs to
 * look at (paid twice, failed, couldn't match, wrong amount) with "Mark as
 * checked", and the most recent ones below. Renders nothing for an academy
 * that has never received an online payment.
 */
export function OnlinePaymentsReview({ onChanged }: { onChanged?: () => void }) {
  const { data, isPending, isError } = useOnlinePayments();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isPending) return null;
  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load online payments. Try refreshing.
      </p>
    );
  }
  if (!data || (data.needs.length === 0 && data.recent.length === 0)) return null;
  const { needs, recent } = data;

  async function markChecked(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/payment-events/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      });
      if (res.ok) {
        toast.success("Marked as checked.");
        await queryClient.invalidateQueries({ queryKey: ["payment-events"] });
        onChanged?.();
        // The dashboard count is server-rendered.
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't update it.");
      }
    } catch {
      toast.error("Couldn't update it. Check your connection.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="online-payments-heading" className="flex flex-col gap-3">
      <h2 id="online-payments-heading" className="font-heading text-xl tracking-wide">
        Online payments
      </h2>

      {needs.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-600/50 bg-amber-50 p-3 dark:bg-amber-950/30">
          <p className="text-sm font-medium">
            {needs.length === 1 ? "1 payment needs a look" : `${needs.length} payments need a look`}
          </p>
          <p className="text-sm text-muted-foreground">
            Sort each one out, then press Mark as checked to clear it from here and the dashboard.
          </p>
          <ul className="flex flex-col gap-2">
            {needs.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">
                    {e.member_id && e.members ? (
                      <Link
                        href={`/members/${e.member_id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {who(e)}
                      </Link>
                    ) : (
                      who(e)
                    )}
                    {!e.livemode ? (
                      <Badge variant="outline" className="ml-2">
                        Test
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">{explain(e)}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "d MMM, HH:mm")}
                  </span>
                </div>
                <Button
                  variant="outline"
                  className="h-11 shrink-0"
                  disabled={busyId === e.id}
                  onClick={() => markChecked(e.id)}
                >
                  {busyId === e.id ? "Saving..." : "Mark as checked"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing needs a look.</p>
      )}

      <details className="rounded-md border p-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          Recent online payments
        </summary>
        <ul className="mt-2 flex flex-col divide-y">
          {recent.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 py-2">
              <span className="font-medium">
                {who(e)}
                {!e.livemode ? (
                  <span className="font-normal text-muted-foreground"> (test)</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">{explain(e)}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(e.created_at), "d MMM, HH:mm")}
                {e.reviewed_at ? " · checked" : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
