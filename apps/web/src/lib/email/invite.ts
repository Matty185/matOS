import "server-only";
import { Resend } from "resend";

// resend.dev's shared sandbox sender — works without domain verification,
// appropriate for alpha/demo. Swap for a verified domain address before any
// real (non-test) gym relies on invite emails actually landing reliably.
const FROM_ADDRESS = "MatOS <onboarding@resend.dev>";

type SendInviteEmailParams = {
  to: string;
  memberFirstName: string;
  gymName: string;
  claimUrl: string;
};

export async function sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: `You're invited to ${params.gymName} on MatOS`,
    html: `
      <p>Hi ${params.memberFirstName},</p>
      <p>Your coach at ${params.gymName} has set up your MatOS account.</p>
      <p><a href="${params.claimUrl}">Click here to set your password and get started</a></p>
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
