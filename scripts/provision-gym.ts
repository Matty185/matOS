// Stage O2 — provision a real gym and its owner (matos_onboarding_plan.md §3.1).
//
// The app has no public "create a gym" path by design (an open self-serve
// gym-creation endpoint is an abuse surface the alpha doesn't need — each
// real gym is onboarded by hand). This script is that hand: run by the
// platform operator, service-role, before meeting the coach.
//
// It creates the `gyms` row (kind 'gym', onboarding not yet completed — so
// the owner lands in the /setup wizard), the owner's `members` row
// (role gym_owner) with a starting-rank belt_history row, and an owner
// invite using exactly the same token scheme as every other invite
// (random UUID, only its SHA-256 stored, 7-day expiry, 5 attempts). It then
// PRINTS the claim URL — no email is sent (no verified sending domain yet);
// you hand the link over in person. The coach claims through the existing
// /invite/[token] flow, which sets their password (or, if the email already
// has a MatOS account, verifies the existing one).
//
// Usage (from the repo root):
//   npm run provision-gym -- --name "Republic BJJ" --owner-email coach@x.ie \
//     --owner-first Sean --owner-last Murphy [--owner-belt black] \
//     [--timezone Europe/Dublin] [--address "..."] [--contact-email ...] \
//     [--app-url https://matos.example]
//
//   npm run provision-gym -- --relink --owner-email coach@x.ie [--app-url ...]
//     Issues a fresh owner invite link (invalidating the previous one) for an
//     owner who hasn't claimed yet — e.g. the first link expired or was lost.
//
//   npm run provision-gym -- --owner-reset --owner-email coach@x.ie [--app-url ...]
//     Prints a one-hour password reset link for an owner who has claimed
//     their account but forgotten the password (coaches/athletes get theirs
//     from the owner in-app; the owner has nobody above them to ask).

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidTimeZone, DEFAULT_GYM_TIMEZONE, type Database } from "@matos/shared";

const INVITE_EXPIRY_DAYS = 7; // matches apps/web/src/lib/auth/invite-token.ts

const BELTS = [
  "white",
  "blue",
  "purple",
  "brown",
  "black",
  "grey_white",
  "grey",
  "grey_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
] as const;
type Belt = (typeof BELTS)[number];

function loadEnv() {
  for (const candidate of [".env.local", "apps/web/.env.local"]) {
    const envPath = resolve(process.cwd(), candidate);
    if (!existsSync(envPath)) continue;
    for (const raw of readFileSync(envPath, "utf8").split("\n")) {
      const match = raw.replace(/\r$/, "").match(/^([A-Z_]+)=(.*)$/);
      if (!match) continue;
      const [, key, value] = match as [string, string, string];
      if (!process.env[key]) process.env[key] = value.replace(/^"|"$/g, "");
    }
  }
}

function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function str(args: Record<string, string | true>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function issueOwnerInvite(
  supabase: ReturnType<typeof createClient<Database>>,
  memberId: string,
  gymId: string,
): Promise<string> {
  // Resend semantics, same as createInvite: expire any unclaimed
  // prior invite rather than deleting it.
  await supabase
    .from("invites")
    .update({ expires_at: new Date().toISOString() })
    .eq("member_id", memberId)
    .is("claimed_at", null);

  const rawToken = randomUUID();
  const expires = new Date();
  expires.setDate(expires.getDate() + INVITE_EXPIRY_DAYS);

  const { error } = await supabase.from("invites").insert({
    member_id: memberId,
    gym_id: gymId,
    token_hash: createHash("sha256").update(rawToken).digest("hex"),
    expires_at: expires.toISOString(),
  });
  if (error) fail(`Couldn't create the owner invite: ${error.message}`);
  return rawToken;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (looked in .env.local and apps/web/.env.local).",
    );
  }
  const appUrl = (str(args, "app-url") ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl) fail("No app URL — pass --app-url https://your-production-domain");

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ownerEmail = str(args, "owner-email")?.toLowerCase();
  if (!ownerEmail || !EMAIL_RE.test(ownerEmail))
    fail("--owner-email is required and must be a valid email.");

  // ── Owner password reset ─────────────────────────────────────────────────
  if (args["owner-reset"]) {
    // Real gyms only — never a personal workspace whose solo owner merely
    // shares the email (security review O2).
    const { data: owners, error } = await supabase
      .from("members")
      .select("user_id, first_name, gym_id, gyms!inner(kind)")
      .eq("email", ownerEmail)
      .eq("role", "gym_owner")
      .eq("gyms.kind", "gym");
    if (error) fail(error.message);
    const owner = owners?.find((o) => o.user_id);
    if (!owner?.user_id) fail(`No claimed gym owner account found for ${ownerEmail}.`);
    const { data: authUser } = await supabase.auth.admin.getUserById(owner.user_id);
    const authEmail = authUser?.user?.email;
    if (!authEmail) fail("Couldn't look up that owner's login.");
    await auditOrFail(
      supabase,
      owner.gym_id,
      "member.password_reset_link_created",
      "operator owner reset",
    );
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: authEmail,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) fail(`Couldn't create a reset link: ${linkError?.message}`);
    console.log(`
✓ Password reset link for ${owner.first_name} (single use, expires in 1 hour):
`);
    console.log(`  ${appUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}
`);
    return;
  }

  // ── Relink mode ──────────────────────────────────────────────────────────
  if (args.relink) {
    const { data: owners, error } = await supabase
      .from("members")
      .select("id, gym_id, user_id, first_name, gyms!inner(name, kind)")
      .eq("email", ownerEmail)
      .eq("role", "gym_owner")
      .eq("gyms.kind", "gym");
    if (error) fail(error.message);
    if (!owners || owners.length === 0) fail(`No gym owner found with email ${ownerEmail}.`);
    if (owners.length > 1) fail(`${ownerEmail} owns more than one gym — relink by hand.`);
    const owner = owners[0]!;
    if (owner.user_id) {
      fail(
        `${ownerEmail} has already claimed their account — they can just sign in at ${appUrl}/login.`,
      );
    }
    const token = await issueOwnerInvite(supabase, owner.id, owner.gym_id);
    await auditOrFail(supabase, owner.gym_id, "invite.created", "operator owner relink");
    printLink(appUrl, token, owner.first_name, (owner.gyms as { name: string }).name);
    return;
  }

  // ── Create mode ──────────────────────────────────────────────────────────
  const name = str(args, "name");
  const ownerFirst = str(args, "owner-first");
  const ownerLast = str(args, "owner-last");
  if (!name || !ownerFirst || !ownerLast) {
    fail("--name, --owner-first and --owner-last are required.");
  }
  const timezone = str(args, "timezone") ?? DEFAULT_GYM_TIMEZONE;
  if (!isValidTimeZone(timezone) || !timezone.includes("/")) {
    fail(`--timezone must be an IANA zone like Europe/Dublin (got "${timezone}").`);
  }
  const ownerBelt = (str(args, "owner-belt") ?? "black") as Belt;
  if (!BELTS.includes(ownerBelt)) fail(`--owner-belt must be one of: ${BELTS.join(", ")}`);
  const contactEmail = str(args, "contact-email")?.toLowerCase() ?? ownerEmail;
  if (!EMAIL_RE.test(contactEmail)) fail("--contact-email must be a valid email.");

  const { data: existing } = await supabase
    .from("gyms")
    .select("id")
    .eq("kind", "gym")
    .ilike(
      "name",
      name.replace(/[\\%_]/g, (c) => `\\${c}`),
    );
  if (existing && existing.length > 0) {
    fail(`A gym called "${name}" already exists. Use --relink to issue a new owner link.`);
  }

  const { data: existingAuth } = await supabase
    .from("members")
    .select("id")
    .eq("email", ownerEmail)
    .not("user_id", "is", null)
    .limit(1);
  if (existingAuth && existingAuth.length > 0) {
    console.log(
      `  Note: ${ownerEmail} already has a MatOS login — they'll confirm their existing password when they open the link.`,
    );
  }

  console.log(`Creating ${name}...`);
  const { data: gym, error: gymError } = await supabase
    .from("gyms")
    .insert({
      name,
      kind: "gym",
      timezone,
      address: str(args, "address") ?? null,
      contact_email: contactEmail,
      onboarding_completed_at: null,
      // Payment obligations start the month the gym joins MatOS — there's
      // no history before that, so earlier months must not read as overdue.
      payments_tracked_from: `${new Date().toISOString().slice(0, 7)}-01`,
    })
    .select("id")
    .single();
  if (gymError || !gym) fail(`Couldn't create the gym: ${gymError?.message}`);

  // Best-effort rollback: a gym with no owner is unreachable and confusing.
  async function rollbackGym() {
    const { error } = await supabase.from("gyms").delete().eq("id", gym!.id);
    if (error) console.error(`  (rollback: couldn't delete gym ${gym!.id}: ${error.message})`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: owner, error: ownerError } = await supabase
    .from("members")
    .insert({
      gym_id: gym.id,
      role: "gym_owner",
      first_name: ownerFirst,
      last_name: ownerLast,
      email: ownerEmail,
      belt: ownerBelt,
      membership_plan: "monthly",
      join_date: today,
    })
    .select("id")
    .single();
  if (ownerError || !owner) {
    await rollbackGym();
    fail(`Couldn't create the owner: ${ownerError?.message}`);
  }

  const { error: beltError } = await supabase.from("belt_history").insert({
    member_id: owner.id,
    gym_id: gym.id,
    belt: ownerBelt,
    stripes: 0,
    promoted_at: `${today}T00:00:00Z`,
    is_initial: true,
    notes: "Starting rank",
  });
  if (beltError)
    console.warn(`  (couldn't record starting rank: ${beltError.message} — not fatal)`);

  await supabase.from("audit_log").insert({
    gym_id: gym.id,
    actor_id: null,
    action: "gym.provisioned",
    entity_type: "gyms",
    entity_id: gym.id,
    after_state: { name, timezone },
    initiated_by: "coach_manual",
  });

  const token = await issueOwnerInvite(supabase, owner.id, gym.id);
  await auditOrFail(supabase, gym.id, "invite.created", "operator owner invite");
  printLink(appUrl, token, ownerFirst, name);
}

/** Operator actions that hand out a credential are logged; abort if not. */
async function auditOrFail(
  supabase: ReturnType<typeof createClient<Database>>,
  gymId: string,
  action: string,
  note: string,
) {
  const { error } = await supabase.from("audit_log").insert({
    gym_id: gymId,
    actor_id: null,
    action,
    entity_type: "gyms",
    entity_id: gymId,
    after_state: { via: note },
    initiated_by: "coach_manual",
  });
  if (error) fail(`Couldn't write the audit log (${error.message}) — no link printed.`);
}

function printLink(appUrl: string, token: string, firstName: string, gymName: string) {
  const link = `${appUrl}/invite/${token}`;
  console.log(`\n✓ ${gymName} is ready for ${firstName}.\n`);
  console.log(`  Owner sign-up link (single use, expires in ${INVITE_EXPIRY_DAYS} days):\n`);
  console.log(`  ${link}\n`);
  if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    console.log(
      "  ⚠ This is a local URL — pass --app-url with your production domain for the real link.\n",
    );
  }
  console.log("  Treat it like a password: whoever opens it first becomes the gym owner.\n");
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
