import "server-only";
import { Resend } from "resend";

// resend.dev's shared sandbox sender only delivers to the Resend account
// owner's own inbox. Stage O2: the real sender comes from env once a domain
// is verified, and invite *email* is only offered at all when
// INVITE_EMAIL_ENABLED=true — until then coaches share invite links
// directly (copy / QR / WhatsApp), which always works.
const FROM_ADDRESS = process.env.INVITE_FROM_ADDRESS || "MatOS <onboarding@resend.dev>";

export function isInviteEmailEnabled(): boolean {
  return process.env.INVITE_EMAIL_ENABLED === "true";
}

type SendInviteEmailParams = {
  to: string;
  memberFirstName: string;
  gymName: string;
  claimUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `You're invited to ${params.gymName} on MatOS`,
    html: `
      <p>Hi ${escapeHtml(params.memberFirstName)},</p>
      <p>Your coach at ${escapeHtml(params.gymName)} has set up your MatOS account.</p>
      <p><a href="${escapeHtml(params.claimUrl)}">Click here to set your password and get started</a></p>
      <p>This link expires in 7 days.</p>
    `,
    text: `Hi ${params.memberFirstName},\n\nYour coach at ${params.gymName} has set up your MatOS account.\n\nSet your password: ${params.claimUrl}\n\nThis link expires in 7 days.`,
  });

  if (error) {
    // Surfaced to the caller as a thrown error so the invite route can
    // decide how to respond — sending the email is the whole point of the
    // route, unlike an audit-log write, which should never block on failure.
    throw new Error(`Failed to send invite email: ${error.message}`);
  }
}
