/**
 * Stage L2: reads the client_reference_id L1 puts on every Payment Link
 * (see payReference in lib/payments/pay-link.ts):
 *   "Ana-Murphy_2026-11_3f2a9c1b"  → a month
 *   "Ana-Murphy_class_3f2a9c1b"    → a class (pay-per-class plan)
 * The name part is only for people reading Stripe; matching uses the
 * 8-character member id prefix, within the gym the webhook belongs to.
 */
export type ParsedReference =
  | { kind: "month"; month: number; year: number; idPrefix: string }
  | { kind: "class"; idPrefix: string };

const REFERENCE = /^[A-Za-z0-9-]{1,90}_(\d{4}-\d{2}|class)_([0-9a-f]{8})$/;

export function parsePaymentReference(ref: unknown): ParsedReference | null {
  if (typeof ref !== "string" || ref.length > 200) return null;
  const m = REFERENCE.exec(ref);
  if (!m) return null;
  const what = m[1]!;
  const idPrefix = m[2]!;
  if (what === "class") return { kind: "class", idPrefix };
  const year = Number(what.slice(0, 4));
  const month = Number(what.slice(5, 7));
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { kind: "month", month, year, idPrefix };
}
