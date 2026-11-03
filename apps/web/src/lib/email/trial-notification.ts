import "server-only";
import { Resend } from "resend";
import { isInviteEmailEnabled } from "@/lib/email/invite";

// Flow audit 7.4 + 9.1: tell the gym a trial request came in. Off until a
// sending domain is verified (the same switch as invite email:
// INVITE_EMAIL_ENABLED=true and INVITE_FROM_ADDRESS on the domain — see
// matos_email_setup.md). Sent to the gym's own contact email (Settings →
// Gym). Deliberately carries no contact details of the visitor: the coach
// opens MatOS to see them, so a forwarded or leaked email exposes little.
const FROM_ADDRESS = process.env.INVITE_FROM_ADDRESS || "MatOS <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function notifyGymOfTrialRequest(params: {
  to: string | null;
  gymName: string;
  visitorFirstName: string;
  forChild: boolean;
  wantsLabel: string;
  trialsUrl: string;
}): Promise<void> {
  if (!isInviteEmailEnabled() || !params.to || !process.env.RESEND_API_KEY) return;
  const who = params.forChild
    ? `A parent asked about a trial for ${params.visitorFirstName}`
    : `${params.visitorFirstName} asked for a free trial`;
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: `New trial request at ${params.gymName}`,
      text: `${who}.\nWants to try: ${params.wantsLabel}.\n\nSee their details and follow up: ${params.trialsUrl}`,
      html: `<p>${escapeHtml(who)}.</p><p>Wants to try: ${escapeHtml(params.wantsLabel)}.</p><p><a href="${escapeHtml(params.trialsUrl)}">See their details and follow up in MatOS</a></p>`,
    });
    if (error) console.error("[trial] notification email failed", error.name);
  } catch {
    console.error("[trial] notification email failed");
  }
}
