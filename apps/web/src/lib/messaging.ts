// Flow audit 6.5 + 7.3: messaging a member from the coach's own phone or
// email app — no sending domain needed. Links only; nothing is sent or
// stored by MatOS.

/**
 * Phone number in international digits for wa.me ("353871234567"), or null.
 * "+353 87…" / "00353 87…" keep their country code; a national number
 * starting with 0 is assumed Irish (the first gyms are in Ireland — revisit
 * with a per-gym country setting when that changes).
 */
export function internationalDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `353${digits.slice(1)}`;
  }
  // "+353 (0)87…" / "+353 087…": the trunk 0 doesn't belong after the code.
  if (digits.startsWith("3530")) digits = `353${digits.slice(4)}`;
  // Irish numbers are 353 + 8-9 digits; anything else just needs to look
  // like a real international number.
  if (digits.startsWith("353")) return digits.length === 11 || digits.length === 12 ? digits : null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const d = internationalDigits(phone);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

export function smsUrl(phone: string | null | undefined, text: string): string | null {
  const d = internationalDigits(phone);
  // "?&body=" works on both iOS and Android.
  return d ? `sms:+${d}?&body=${encodeURIComponent(text)}` : null;
}

export function mailtoUrl(
  email: string | null | undefined,
  subject: string,
  text: string,
): string | null {
  if (!email) return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export type MessageKind = "missed" | "payment" | "general";

export function messageTemplate(
  kind: MessageKind,
  firstName: string,
  gymName: string,
): { subject: string; text: string } {
  if (kind === "general") {
    return { subject: gymName, text: `Hi ${firstName}, ` };
  }
  if (kind === "missed") {
    return {
      subject: `We've missed you at ${gymName}`,
      text: `Hi ${firstName}, we haven't seen you on the mats at ${gymName} in a while and wanted to check in. Hope all's well! Let us know if anything's stopping you from coming back. See you soon.`,
    };
  }
  return {
    subject: `Membership payment — ${gymName}`,
    text: `Hi ${firstName}, a quick reminder from ${gymName} about your membership payment. Could you sort it when you get a chance, or let us know if you've any questions? Thanks!`,
  };
}

/** "+353 87 123 4567"-style display of where a WhatsApp/SMS will go. */
export function displayInternational(phone: string | null | undefined): string | null {
  const d = internationalDigits(phone);
  if (!d) return null;
  if (d.startsWith("353")) return `+353 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}
