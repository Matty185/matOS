# MatOS — switching on email (flow audit 7.4)

Email is built but **off**. Every flow already works without it: invite and
password-reset links are shared by the coach (copy / QR / WhatsApp). Turning
email on needs a sending domain you control, which only you can verify.

## 1. Verify a sending domain in Resend

1. Choose the address mail should come from, e.g. `noreply@yourgym.ie` (a
   subdomain such as `mail.yourgym.ie` keeps it separate from your normal
   mailbox).
2. Resend dashboard → **Domains** → **Add domain** → enter the domain.
3. Add the DNS records Resend shows (SPF `TXT`, DKIM records, and the
   optional DMARC `TXT`) at whoever hosts the domain's DNS.
4. Wait until Resend shows the domain as **Verified** (minutes to a few
   hours).

## 2. Set the Vercel environment variables (Production)

| Variable               | Value                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `INVITE_EMAIL_ENABLED` | `true`                                                                   |
| `INVITE_FROM_ADDRESS`  | `Your Gym <noreply@yourgym.ie>` (the verified domain)                    |
| `RESEND_API_KEY`       | already set — make sure it's a key from the account that owns the domain |
| `NEXT_PUBLIC_APP_URL`  | the production URL (links in emails use it)                              |

Then redeploy (Vercel → Deployments → Redeploy), so the new values load.

## 3. What switches on

- **Invites by email.** Adding a member with an email sends their invite
  automatically, and the invite dialog offers "Send by email" alongside
  copy / QR / WhatsApp.
- **New trial requests** email the gym's contact address (Settings → Gym →
  contact email — set it). The email carries the visitor's first name and the
  class they asked for only; coaches open MatOS for contact details.

## 4. Optional: password-reset emails

Today "Forgot password" tells members to ask their coach for a reset link.
To let members reset by email instead:

1. Supabase dashboard → **Authentication → SMTP Settings** → enable custom
   SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = the
   Resend API key, sender = the verified address.
2. Authentication → **URL Configuration**: Site URL = production URL; add
   `<production URL>/reset-password` to the redirect allow-list.
3. Ask Claude to switch the Forgot-password page to send the email (a small
   code change, not done yet — it needs a real inbox to test against).

## 5. After it works, tighten what was accepted without email

The Decision Log accepted two risks only because there was no email
(stages O2 and O7): whoever holds an invite or sign-up link can create a
login for any email address. With email working, require the person to
confirm their email before a new account is created. Ask Claude to do this
once step 4 is done.

## 6. Check it

- Add a test member with your own email: the invite should arrive.
- Turn on the trial link (Settings), submit a request from a private window:
  the gym contact email should get "New trial request".
- Look in Resend → **Logs** if anything doesn't arrive.
