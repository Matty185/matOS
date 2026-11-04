import { STRIPE_PAYMENT_LINK } from "@matos/shared";
import type { AthletePaymentSummary } from "./athlete-status";

// Flow audit 6.6 (L1): the "Pay online" link for a member's plan. Opens the
// gym's own Stripe Payment Link with two query parameters Payment Links
// support: client_reference_id (shown on the payment in Stripe, so the
// coach can see whose payment it is and for which month) and
// prefilled_email. MatOS records nothing here; the coach marks the month
// paid as usual.

export type PayTarget = { month: number; year: number } | "class";

/**
 * What a payment now would be for: the OLDEST unpaid month (so someone
 * behind pays the earliest debt first), else this month if unpaid. Pay-per-
 * class members pay for a class. Null when nothing is due.
 */
export function payTarget(summary: AthletePaymentSummary): PayTarget | null {
  if (summary.kind === "not_billable") return summary.reason === "casual" ? "class" : null;
  const unpaid = [...summary.overdue];
  if (summary.current?.status === "due") unpaid.push(summary.current);
  if (unpaid.length === 0) return null;
  unpaid.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  const oldest = unpaid[0]!;
  return { month: oldest.month, year: oldest.year };
}

/**
 * The reference the coach sees on the payment in Stripe, e.g.
 * "Ana-Murphy_2026-11_3f2a9c1b": readable name, the month (or "class"), and
 * the start of the member id to tell two people with the same name apart.
 * Stripe allows letters, digits, "-" and "_" (up to 200). The name goes to
 * the gym's own Stripe account (it's their member paying them); documented
 * in matos_stripe_setup.md. L2 will match on the 8-character id prefix
 * within the gym, not a full id.
 */
export function payReference(
  member: { id: string; firstName: string; lastName: string },
  target: PayTarget,
): string {
  const slug = (s: string) =>
    s
      .normalize("NFKD")
      // Drop the accents NFKD split off (Seán -> Sean, not Sea-n).
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "member";
  const what =
    target === "class" ? "class" : `${target.year}-${String(target.month).padStart(2, "0")}`;
  return `${slug(member.firstName)}-${slug(member.lastName)}_${what}_${member.id.replace(/-/g, "").slice(0, 8)}`;
}

/** The full link, or null if the stored URL isn't a Stripe Payment Link. */
export function payLinkHref(
  url: string | null | undefined,
  member: { id: string; firstName: string; lastName: string },
  target: PayTarget,
  email?: string | null,
): string | null {
  if (!url || !STRIPE_PAYMENT_LINK.test(url)) return null;
  const ref = payReference(member, target);
  const params = new URLSearchParams({ client_reference_id: ref });
  if (email) params.set("prefilled_email", email);
  return `${url}?${params.toString()}`;
}
