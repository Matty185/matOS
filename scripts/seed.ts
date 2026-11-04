// MatOS Stage 9: seed script. Re-runnable (wipe + reseed) — run with
// `npx tsx scripts/seed.ts`. Uses the service-role client per CLAUDE.md
// Rule 4 (seeding is one of the three sanctioned service-role use cases).
//
// Scope: only ever touches the "Northside BJJ" gym's own rows. Never
// touches other gyms (this Supabase project has accumulated a lot of
// leftover throwaway gyms from Stage verification scripts — not this
// script's job to clean those up).
//
// Two things this script deliberately does NOT wipe, both by design:
// - The "Northside BJJ" `gyms` row itself: real audit_log rows already
//   reference it (`gym_id on delete restrict`), so deleting and
//   recreating it would fail anyway. It's found-or-created once, then
//   reused across every re-run.
// - `audit_log`: immutable by DB trigger (blocks UPDATE/DELETE
//   unconditionally, even for the service-role client — see
//   20260715160100_rls_and_functions.sql). Re-running this script does
//   not attempt to touch it, and seeding itself never writes audit_log
//   rows (seeded rows are fixture data, not real user actions).
//
// The gym owner's login (matijukm@gmail.com) is preserved across re-runs:
// this script finds the existing auth.users row and relinks a fresh
// `members` row to it rather than recreating the account, so the owner's
// password never changes. The coach and one demo athlete get their own
// real logins, created (or password-reset, if already present from a
// prior run) each time this script runs — the generated passwords are
// printed at the end.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@matos/shared";

// ── env ──────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    // Both groups are mandatory in the pattern above, so a successful match
    // guarantees they're defined — noUncheckedIndexedAccess just can't see
    // that through a regex match array.
    const [, key, value] = match as [string, string, string];
    if (!process.env[key]) {
      process.env[key] = value.replace(/^"|"$/g, "");
    }
  }
}
loadEnvLocal();

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

// Insert-then-select returns rows in the same order the array was given in
// (reliable in practice for a single batch insert), so a parallel forEach
// index always lines up — noUncheckedIndexedAccess just can't see that.
function at<T>(arr: T[], i: number, message: string): T {
  return must(arr[i], message);
}

function assertNoError(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

// ── date helpers ─────────────────────────────────────────────────────────
// Deliberately UTC-only, no host-timezone dependence — this project has hit
// the same "local Date + toISOString rolls the calendar date back near
// midnight on a UTC+1 machine" bug three times across Stages 6-8. Ireland's
// actual UTC offset (+00:00 GMT / +01:00 BST) is computed per-date from the
// real EU DST rule (last Sunday of March -> last Sunday of October) so
// timestamps are correct however far in the future this script is re-run.

function ymd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function todayUTC(): string {
  return ymd(new Date());
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

function lastSundayUTC(year: number, monthIndex0: number): Date {
  const d = new Date(Date.UTC(year, monthIndex0 + 1, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function isIrishSummerTime(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const dstStart = lastSundayUTC(year, 2); // March
  const dstEnd = lastSundayUTC(year, 9); // October
  return d >= dstStart && d < dstEnd;
}

function dublinISO(dateStr: string, time = "12:00:00"): string {
  const offset = isIrishSummerTime(dateStr) ? "+01:00" : "+00:00";
  return `${dateStr}T${time}${offset}`;
}

function monthsAgoYearMonth(n: number): { year: number; month: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

// ── auth helpers ─────────────────────────────────────────────────────────

function genPassword(): string {
  return `Northside-${randomBytes(5).toString("hex")}`;
}

async function findAuthUserByEmail(email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    assertNoError(error, "listUsers");
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

// Creates the auth account on first run; on every later run it resets the
// password to a freshly generated one and reports it again. That keeps the
// script re-runnable without ever needing to remember a prior password.
async function upsertLoginResettingPassword(
  email: string,
  fullName: string,
): Promise<{ id: string; password: string }> {
  const existing = await findAuthUserByEmail(email);
  const password = genPassword();
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
    assertNoError(error, `reset password for ${email}`);
    return { id: existing.id, password };
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  assertNoError(error, `create auth user ${email}`);
  return { id: must(data.user, `no user returned for ${email}`).id, password };
}

// ── class schedule ───────────────────────────────────────────────────────

const CLASSES = [
  {
    key: "mon_fun",
    name: "Fundamentals",
    class_type: "gi",
    day_of_week: 1,
    start_time: "18:00",
    duration_minutes: 60,
    max_capacity: 20,
  },
  {
    key: "mon_adv",
    name: "Advanced",
    class_type: "gi",
    day_of_week: 1,
    start_time: "19:15",
    duration_minutes: 75,
    max_capacity: 20,
  },
  {
    key: "tue_nogi",
    name: "No-Gi",
    class_type: "no_gi",
    day_of_week: 2,
    start_time: "18:00",
    duration_minutes: 60,
    max_capacity: 20,
  },
  {
    key: "tue_kids",
    name: "Kids Fundamentals",
    class_type: "gi",
    day_of_week: 2,
    start_time: "17:00",
    duration_minutes: 45,
    max_capacity: 16,
  },
  {
    key: "wed_fun",
    name: "Fundamentals",
    class_type: "gi",
    day_of_week: 3,
    start_time: "18:00",
    duration_minutes: 60,
    max_capacity: 20,
  },
  {
    key: "wed_adv",
    name: "Advanced",
    class_type: "gi",
    day_of_week: 3,
    start_time: "19:15",
    duration_minutes: 75,
    max_capacity: 20,
  },
  {
    key: "thu_nogi",
    name: "No-Gi",
    class_type: "no_gi",
    day_of_week: 4,
    start_time: "18:00",
    duration_minutes: 60,
    max_capacity: 20,
  },
  {
    key: "thu_kids",
    name: "Kids Fundamentals",
    class_type: "gi",
    day_of_week: 4,
    start_time: "17:00",
    duration_minutes: 45,
    max_capacity: 16,
  },
  {
    key: "fri_openmat",
    name: "Open Mat",
    class_type: "open_mat",
    day_of_week: 5,
    start_time: "18:00",
    duration_minutes: 90,
    max_capacity: 30,
  },
  {
    key: "sat_comp",
    name: "Comp Team Training",
    class_type: "comp",
    day_of_week: 6,
    start_time: "10:00",
    duration_minutes: 90,
    max_capacity: 15,
  },
] as const;

type ClassKey = (typeof CLASSES)[number]["key"];

// ── roster ───────────────────────────────────────────────────────────────

type BeltColor = Database["public"]["Enums"]["belt_color"];

type AthleteDef = {
  key: string;
  first: string;
  last: string;
  belt: BeltColor;
  stripes: number;
  plan: "monthly" | "casual" | "comp_team";
  joinDaysAgo: number;
  regularClasses: ClassKey[];
  attendanceProbability: number;
  login?: boolean;
  promotion?: { fromBelt: BeltColor; fromStripes: number; promotedDaysAgo: number };
};

const ATHLETES: AthleteDef[] = [
  {
    key: "aoife",
    first: "Aoife",
    last: "Byrne",
    belt: "blue",
    stripes: 2,
    plan: "monthly",
    joinDaysAgo: 420,
    regularClasses: ["mon_fun", "wed_adv"],
    attendanceProbability: 0.8,
    login: true,
  },
  {
    key: "cian",
    first: "Cian",
    last: "Doyle",
    belt: "white",
    stripes: 1,
    plan: "monthly",
    joinDaysAgo: 90,
    regularClasses: ["tue_nogi", "thu_nogi"],
    attendanceProbability: 0.75,
  },
  {
    key: "niamh",
    first: "Niamh",
    last: "Kelly",
    belt: "purple",
    stripes: 0,
    plan: "comp_team",
    joinDaysAgo: 660,
    regularClasses: ["mon_adv", "wed_adv", "sat_comp", "thu_nogi"],
    attendanceProbability: 0.85,
    promotion: { fromBelt: "blue", fromStripes: 4, promotedDaysAgo: 70 },
  },
  {
    key: "darragh",
    first: "Darragh",
    last: "Walsh",
    belt: "white",
    stripes: 0,
    plan: "casual",
    joinDaysAgo: 30,
    regularClasses: ["fri_openmat"],
    attendanceProbability: 0.5,
  },
  {
    key: "saoirse",
    first: "Saoirse",
    last: "Murphy",
    belt: "blue",
    stripes: 0,
    plan: "monthly",
    joinDaysAgo: 270,
    regularClasses: ["mon_fun", "thu_nogi"],
    attendanceProbability: 0.75,
  },
  {
    key: "eoin",
    first: "Eoin",
    last: "Fitzgerald",
    belt: "brown",
    stripes: 1,
    plan: "comp_team",
    joinDaysAgo: 900,
    regularClasses: ["mon_adv", "wed_adv", "sat_comp"],
    attendanceProbability: 0.9,
    promotion: { fromBelt: "purple", fromStripes: 4, promotedDaysAgo: 56 },
  },
  {
    key: "grace",
    first: "Grace",
    last: "O'Connor",
    belt: "white",
    stripes: 2,
    plan: "monthly",
    joinDaysAgo: 180,
    regularClasses: ["wed_fun", "fri_openmat"],
    attendanceProbability: 0.7,
  },
  {
    key: "ronan",
    first: "Ronan",
    last: "Byrne",
    belt: "blue",
    stripes: 1,
    plan: "casual",
    joinDaysAgo: 330,
    regularClasses: ["tue_nogi"],
    attendanceProbability: 0.55,
  },
  {
    key: "ciara",
    first: "Ciara",
    last: "Duffy",
    belt: "white",
    stripes: 0,
    plan: "monthly",
    joinDaysAgo: 60,
    regularClasses: ["mon_fun", "wed_fun"],
    attendanceProbability: 0.7,
  },
  {
    key: "fionn",
    first: "Fionn",
    last: "Brennan",
    belt: "purple",
    stripes: 1,
    plan: "comp_team",
    joinDaysAgo: 600,
    regularClasses: ["mon_adv", "sat_comp", "tue_nogi"],
    attendanceProbability: 0.85,
    promotion: { fromBelt: "blue", fromStripes: 4, promotedDaysAgo: 42 },
  },
  {
    key: "ella",
    first: "Ella",
    last: "Ryan",
    belt: "grey_white",
    stripes: 0,
    plan: "monthly",
    joinDaysAgo: 240,
    regularClasses: ["tue_kids", "thu_kids"],
    attendanceProbability: 0.75,
  },
  {
    key: "jack",
    first: "Jack",
    last: "Nolan",
    belt: "yellow",
    stripes: 1,
    plan: "monthly",
    joinDaysAgo: 150,
    regularClasses: ["tue_kids", "thu_kids"],
    attendanceProbability: 0.7,
  },
  {
    key: "sophie",
    first: "Sophie",
    last: "Lynch",
    belt: "orange_black",
    stripes: 2,
    plan: "monthly",
    joinDaysAgo: 480,
    regularClasses: ["tue_kids", "thu_kids", "sat_comp"],
    attendanceProbability: 0.75,
  },
  {
    key: "tadhg",
    first: "Tadhg",
    last: "Kavanagh",
    belt: "white",
    stripes: 1,
    plan: "monthly",
    joinDaysAgo: 120,
    regularClasses: ["wed_fun", "fri_openmat"],
    attendanceProbability: 0.65,
  },
  {
    key: "aisling",
    first: "Aisling",
    last: "Hughes",
    belt: "blue",
    stripes: 1,
    plan: "monthly",
    joinDaysAgo: 510,
    regularClasses: ["mon_fun", "wed_adv", "fri_openmat"],
    attendanceProbability: 0.8,
    promotion: { fromBelt: "white", fromStripes: 4, promotedDaysAgo: 84 },
  },
  {
    key: "conor",
    first: "Conor",
    last: "Maguire",
    belt: "white",
    stripes: 0,
    plan: "casual",
    joinDaysAgo: 14,
    regularClasses: ["fri_openmat"],
    attendanceProbability: 0.6,
  },
];

const LOG_MEMBER_KEYS = ["aoife", "niamh", "fionn", "cian"];
const OVERDUE_MEMBER_KEYS = ["darragh", "ronan", "conor", "grace"];
const WAIVED_ONCE_MEMBER_KEYS = ["sophie", "cian"];

const PLAN_AMOUNT: Record<AthleteDef["plan"], number> = {
  monthly: 100,
  casual: 60,
  comp_team: 140,
};

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const GYM_NAME = "Northside BJJ";
  const OWNER_EMAIL = "matijukm@gmail.com";
  const COACH_EMAIL = "coach@northsidebjj.demo";
  const DEMO_ATHLETE_EMAIL = "demo.athlete@northsidebjj.demo";

  console.log("Resolving gym...");
  const { data: existingGym, error: gymFindError } = await supabase
    .from("gyms")
    .select("id")
    .eq("name", GYM_NAME)
    .maybeSingle();
  assertNoError(gymFindError, "find gym");

  let gymId: string;
  if (existingGym) {
    gymId = existingGym.id;
    const { error } = await supabase
      .from("gyms")
      .update({
        address: "42 Griffith Avenue, Dublin 9, D09 X1Y2",
        contact_email: "info@northsidebjj.demo",
        active: true,
      })
      .eq("id", gymId);
    assertNoError(error, "update gym");
  } else {
    const { data, error } = await supabase
      .from("gyms")
      .insert({
        name: GYM_NAME,
        address: "42 Griffith Avenue, Dublin 9, D09 X1Y2",
        contact_email: "info@northsidebjj.demo",
        active: true,
      })
      .select("id")
      .single();
    assertNoError(error, "create gym");
    gymId = must(data, "no gym returned").id;
  }
  console.log(`Gym: ${gymId}`);

  console.log("Resolving logins...");
  const ownerAuth = must(
    await findAuthUserByEmail(OWNER_EMAIL),
    `Owner auth account ${OWNER_EMAIL} not found — expected it to already exist.`,
  );
  const coachAuth = await upsertLoginResettingPassword(COACH_EMAIL, "Sarah Nolan");
  const athleteAuth = await upsertLoginResettingPassword(DEMO_ATHLETE_EMAIL, "Aoife Byrne");

  console.log("Wiping existing gym data...");
  for (const table of [
    "notifications",
    "deletion_requests",
    "gdpr_consents",
    "invites",
    "athlete_logs",
    "payments",
    "attendance",
    "belt_history",
    "agent_rate_limits",
    "classes",
    // breakdowns before external_people/members: both
    // breakdowns.external_person_id and breakdowns.member_id are
    // "on delete restrict" (Stage A1 schema) — deleting the parent first
    // would fail while a breakdown still references it. breakdown_positions/
    // breakdown_events cascade-delete with their parent breakdown, so
    // neither needs its own entry here.
    "breakdowns",
    "external_people",
    "members",
  ] as const) {
    const { error } = await supabase.from(table).delete().eq("gym_id", gymId);
    assertNoError(error, `wipe ${table}`);
  }

  console.log("Inserting classes...");
  const classRows = CLASSES.map((c) => ({
    name: c.name,
    class_type: c.class_type,
    day_of_week: c.day_of_week,
    start_time: c.start_time,
    duration_minutes: c.duration_minutes,
    max_capacity: c.max_capacity,
    gym_id: gymId,
  }));
  const { data: insertedClasses, error: classError } = await supabase
    .from("classes")
    .insert(classRows)
    .select("id, name, day_of_week, start_time");
  assertNoError(classError, "insert classes");
  const classIdByKey = new Map<ClassKey, string>();
  const classRowsById = must(insertedClasses, "classes");
  CLASSES.forEach((c, i) => classIdByKey.set(c.key, at(classRowsById, i, "class row").id));

  const today = todayUTC();

  console.log("Inserting members...");
  const { data: ownerMember, error: ownerError } = await supabase
    .from("members")
    .insert({
      gym_id: gymId,
      user_id: ownerAuth.id,
      role: "gym_owner",
      first_name: "Matty",
      last_name: "Matijuk",
      email: OWNER_EMAIL,
      join_date: addDaysUTC(today, -1200),
      belt: "black",
      stripes: 4,
      membership_plan: "comp_team",
      active: true,
    })
    .select("id")
    .single();
  assertNoError(ownerError, "insert owner member");
  const ownerMemberId = must(ownerMember, "owner member").id;

  const { data: coachMember, error: coachError } = await supabase
    .from("members")
    .insert({
      gym_id: gymId,
      user_id: coachAuth.id,
      role: "coach",
      first_name: "Sarah",
      last_name: "Nolan",
      email: COACH_EMAIL,
      join_date: addDaysUTC(today, -1000),
      belt: "black",
      stripes: 1,
      membership_plan: "comp_team",
      active: true,
    })
    .select("id")
    .single();
  assertNoError(coachError, "insert coach member");
  const coachMemberId = must(coachMember, "coach member").id;

  const athleteRows = ATHLETES.map((a) => ({
    gym_id: gymId,
    user_id: a.login ? athleteAuth.id : null,
    role: "athlete" as const,
    first_name: a.first,
    last_name: a.last,
    email: a.login
      ? DEMO_ATHLETE_EMAIL
      : `${a.first.toLowerCase()}.${a.last.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
    join_date: addDaysUTC(today, -a.joinDaysAgo),
    belt: a.belt,
    stripes: a.stripes,
    membership_plan: a.plan,
    active: true,
  }));
  const { data: insertedAthletes, error: athleteError } = await supabase
    .from("members")
    .insert(athleteRows)
    .select("id");
  assertNoError(athleteError, "insert athletes");
  const memberIdByKey = new Map<string, string>();
  const athleteRowsById = must(insertedAthletes, "athletes");
  ATHLETES.forEach((a, i) => memberIdByKey.set(a.key, at(athleteRowsById, i, "athlete row").id));
  memberIdByKey.set("__owner", ownerMemberId);
  memberIdByKey.set("__coach", coachMemberId);

  console.log("Inserting GDPR consents...");
  const allMemberIds = [
    ownerMemberId,
    coachMemberId,
    ...ATHLETES.map((a) => memberIdByKey.get(a.key)!),
  ];
  const consentRows = allMemberIds.map((memberId) => ({
    member_id: memberId,
    gym_id: gymId,
    data_storage_consent: true,
    consented_at: dublinISO(today, "09:00:00"),
    consent_version: "1.0",
  }));
  const { error: consentError } = await supabase.from("gdpr_consents").insert(consentRows);
  assertNoError(consentError, "insert gdpr_consents");

  console.log("Inserting belt history...");
  const beltHistoryRows: Database["public"]["Tables"]["belt_history"]["Insert"][] = [];
  beltHistoryRows.push({
    member_id: ownerMemberId,
    gym_id: gymId,
    belt: "black",
    stripes: 4,
    promoted_at: dublinISO(addDaysUTC(today, -1200), "10:00:00"),
    promoted_by: ownerAuth.id,
    notes: "Founding coach.",
  });
  beltHistoryRows.push({
    member_id: coachMemberId,
    gym_id: gymId,
    belt: "black",
    stripes: 1,
    promoted_at: dublinISO(addDaysUTC(today, -1000), "10:00:00"),
    promoted_by: ownerAuth.id,
    notes: "Joined as head coach.",
  });
  for (const a of ATHLETES) {
    const memberId = memberIdByKey.get(a.key)!;
    const joinDate = addDaysUTC(today, -a.joinDaysAgo);
    if (a.promotion) {
      beltHistoryRows.push({
        member_id: memberId,
        gym_id: gymId,
        belt: a.promotion.fromBelt,
        stripes: a.promotion.fromStripes,
        promoted_at: dublinISO(joinDate, "10:00:00"),
        promoted_by: coachAuth.id,
        notes: "Started training.",
      });
      beltHistoryRows.push({
        member_id: memberId,
        gym_id: gymId,
        belt: a.belt,
        stripes: a.stripes,
        promoted_at: dublinISO(addDaysUTC(today, -a.promotion.promotedDaysAgo), "19:30:00"),
        promoted_by: coachAuth.id,
        notes: `Promoted to ${a.belt.replace("_", " ")}.`,
      });
    } else {
      beltHistoryRows.push({
        member_id: memberId,
        gym_id: gymId,
        belt: a.belt,
        stripes: a.stripes,
        promoted_at: dublinISO(joinDate, "10:00:00"),
        promoted_by: coachAuth.id,
        notes: "Started training.",
      });
    }
  }
  const { error: beltHistoryError } = await supabase.from("belt_history").insert(beltHistoryRows);
  assertNoError(beltHistoryError, "insert belt_history");

  console.log("Generating attendance (this is the slow part)...");
  const windowStart = addDaysUTC(today, -13 * 7);
  const attendanceRows: Database["public"]["Tables"]["attendance"]["Insert"][] = [];
  // Per class+date head count, so seeded self check-ins stay within capacity.
  const sessionCount = new Map<string, number>();
  for (let offset = 0; ; offset++) {
    const dateStr = addDaysUTC(windowStart, offset);
    if (dateStr > today) break;
    const weekday = weekdayOf(dateStr);
    const todaysClasses = CLASSES.filter((c) => c.day_of_week === weekday);
    if (todaysClasses.length === 0) continue;
    for (const cls of todaysClasses) {
      for (const a of ATHLETES) {
        const joinDate = addDaysUTC(today, -a.joinDaysAgo);
        if (dateStr < joinDate) continue;
        if (!a.regularClasses.includes(cls.key)) continue;
        if (Math.random() > a.attendanceProbability) continue;
        const sessionKey = `${cls.key}:${dateStr}`;
        attendanceRows.push({
          member_id: memberIdByKey.get(a.key)!,
          class_id: classIdByKey.get(cls.key)!,
          gym_id: gymId,
          checked_in_at: dublinISO(dateStr, `${cls.start_time}:00`),
          // Self check-ins are refused once a class is full (flow audit
          // 3.5); any past the cap are recorded as marked by a coach.
          checked_in_by:
            Math.random() < 0.15 || (sessionCount.get(sessionKey) ?? 0) >= cls.max_capacity
              ? "coach"
              : "self",
          // Placeholder the generated Insert type requires — Stage 1's
          // attendance_set_checked_in_date trigger unconditionally
          // overwrites it, same as the real mark/check-in routes.
          checked_in_date: dateStr,
        });
        sessionCount.set(sessionKey, (sessionCount.get(sessionKey) ?? 0) + 1);
      }
    }
  }
  for (let i = 0; i < attendanceRows.length; i += 500) {
    const { error } = await supabase.from("attendance").insert(attendanceRows.slice(i, i + 500));
    assertNoError(error, "insert attendance");
  }
  console.log(`  ${attendanceRows.length} attendance rows`);

  console.log("Inserting payments...");
  // Covers 6 trailing months to match the payments grid's own rolling
  // window (WINDOW_LENGTH in src/app/(coach)/payments/page.tsx) — leaving a
  // gap here would make the grid's oldest visible column read as
  // "overdue" for every member with no row at all, per the plan's
  // unpaid-by-default overdue computation (src/lib/payments/overdue.ts).
  const PAYMENT_MONTHS = 6;
  const paymentRows: Database["public"]["Tables"]["payments"]["Insert"][] = [];
  for (const memberId of [ownerMemberId, coachMemberId]) {
    for (let m = 0; m < PAYMENT_MONTHS; m++) {
      const { year, month } = monthsAgoYearMonth(m);
      paymentRows.push({
        member_id: memberId,
        gym_id: gymId,
        period_month: month,
        period_year: year,
        amount: null,
        status: "waived",
        paid_at: null,
        notes: "Staff membership — waived.",
        recorded_by: coachAuth.id,
      });
    }
  }
  for (const a of ATHLETES) {
    const memberId = memberIdByKey.get(a.key)!;
    const joinDate = addDaysUTC(today, -a.joinDaysAgo);
    const amount = PLAN_AMOUNT[a.plan];
    for (let m = 0; m < PAYMENT_MONTHS; m++) {
      const { year, month } = monthsAgoYearMonth(m);
      const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
      if (periodStart < joinDate.slice(0, 7) + "-01") continue;

      let status: "paid" | "unpaid" | "waived" = "paid";
      if (m === 0) {
        status = "unpaid";
      } else if (m === 1 && OVERDUE_MEMBER_KEYS.includes(a.key)) {
        status = "unpaid";
      } else if (m === 2 && WAIVED_ONCE_MEMBER_KEYS.includes(a.key)) {
        status = "waived";
      }

      paymentRows.push({
        member_id: memberId,
        gym_id: gymId,
        period_month: month,
        period_year: year,
        amount: status === "waived" ? null : amount,
        status,
        paid_at:
          status === "paid"
            ? dublinISO(`${year}-${String(month).padStart(2, "0")}-05`, "12:00:00")
            : null,
        notes: status === "waived" ? "Waived — promotional month." : null,
        recorded_by: coachAuth.id,
      });
    }
  }
  for (let i = 0; i < paymentRows.length; i += 500) {
    const { error } = await supabase.from("payments").insert(paymentRows.slice(i, i + 500));
    assertNoError(error, "insert payments");
  }
  console.log(`  ${paymentRows.length} payment rows`);

  console.log("Inserting athlete logs...");
  const logRows: Database["public"]["Tables"]["athlete_logs"]["Insert"][] = [];
  const logContent = [
    {
      working_on: "Closed guard retention",
      struggling_with: "Escaping mount",
      notes: "Feeling more confident with hip movement this week.",
      daysAgo: 3,
    },
    {
      working_on: "Armbar from closed guard",
      struggling_with: "Grip fighting against bigger training partners",
      notes: null,
      daysAgo: 10,
    },
    {
      working_on: "Takedown entries",
      struggling_with: "Timing the level change",
      notes: "Coach gave good feedback after Wednesday's class.",
      daysAgo: 17,
    },
  ];
  for (const key of LOG_MEMBER_KEYS) {
    const memberId = memberIdByKey.get(key)!;
    const entryCount = key === "aoife" ? 2 : 1;
    for (let i = 0; i < entryCount; i++) {
      const content = at(logContent, i % logContent.length, "log content");
      logRows.push({
        member_id: memberId,
        gym_id: gymId,
        entry_date: addDaysUTC(today, -content.daysAgo - i * 7),
        working_on: content.working_on,
        struggling_with: content.struggling_with,
        notes: content.notes,
        visible_to_coach: true,
      });
    }
  }
  const { error: logError } = await supabase.from("athlete_logs").insert(logRows);
  assertNoError(logError, "insert athlete_logs");

  // Stage A8: 2-3 realistic breakdowns on demo members + 1 external person,
  // enough events for a credible profile demo (plan §10's own wording).
  // Taxonomy ids looked up by name rather than hardcoded, same reasoning as
  // everywhere else in this module — "taxonomy is data, not code" — this
  // script is exactly the kind of caller that would silently break if the
  // event_types/positions rows ever get renumbered.
  console.log("Inserting match analysis breakdowns...");
  const { data: positionRows, error: positionsFetchError } = await supabase
    .from("positions")
    .select("id, name");
  assertNoError(positionsFetchError, "fetch positions taxonomy");
  const positionIdByName = new Map((positionRows ?? []).map((p) => [p.name, p.id]));

  const { data: eventTypeRows, error: eventTypesFetchError } = await supabase
    .from("event_types")
    .select("id, name");
  assertNoError(eventTypesFetchError, "fetch event_types taxonomy");
  const eventTypeIdByName = new Map((eventTypeRows ?? []).map((e) => [e.name, e.id]));

  function positionId(name: string): string {
    return must(positionIdByName.get(name), `position taxonomy row "${name}"`);
  }
  function eventTypeId(name: string): string {
    return must(eventTypeIdByName.get(name), `event_type taxonomy row "${name}"`);
  }

  type SeedPosition = {
    position: string;
    role: string | null;
    start_ts: number;
    end_ts: number | null;
  };
  type SeedEvent = {
    event: string;
    modifier?: string;
    outcome?: string;
    ts: number;
  };

  async function seedBreakdown(input: {
    authorId: string;
    memberId?: string;
    externalPersonId?: string;
    name: string;
    matchDate: string;
    gi: boolean;
    result: "win" | "loss" | "draw";
    method: "submission" | "points" | "decision" | "dq";
    durationSeconds: number;
    positions: SeedPosition[];
    events: SeedEvent[];
  }) {
    const { data: breakdown, error: breakdownError } = await supabase
      .from("breakdowns")
      .insert({
        gym_id: gymId,
        author_id: input.authorId,
        member_id: input.memberId ?? null,
        external_person_id: input.externalPersonId ?? null,
        name: input.name,
        match_date: input.matchDate,
        gi: input.gi,
        result: input.result,
        method: input.method,
        duration_seconds: input.durationSeconds,
        status: "complete",
      })
      .select("id")
      .single();
    assertNoError(breakdownError, `insert breakdown "${input.name}"`);
    const breakdownId = must(breakdown, `breakdown "${input.name}"`).id;

    if (input.positions.length > 0) {
      const { error } = await supabase.from("breakdown_positions").insert(
        input.positions.map((p) => ({
          breakdown_id: breakdownId,
          gym_id: gymId,
          position_id: positionId(p.position),
          role: p.role,
          start_ts: p.start_ts,
          end_ts: p.end_ts,
        })),
      );
      assertNoError(error, `insert breakdown_positions for "${input.name}"`);
    }

    if (input.events.length > 0) {
      const { error } = await supabase.from("breakdown_events").insert(
        input.events.map((e) => ({
          breakdown_id: breakdownId,
          gym_id: gymId,
          event_type_id: eventTypeId(e.event),
          modifier: e.modifier ?? null,
          outcome: e.outcome ?? null,
          ts: e.ts,
          source: "manual" as const,
        })),
      );
      assertNoError(error, `insert breakdown_events for "${input.name}"`);
    }
  }

  const aoifeId = memberIdByKey.get("aoife")!;
  const niamhId = memberIdByKey.get("niamh")!;

  const { data: externalPerson, error: externalPersonError } = await supabase
    .from("external_people")
    .insert({
      gym_id: gymId,
      created_by: coachAuth.id,
      display_name: "Jake Sullivan",
      notes: "Visiting competitor, regional open — scouting footage.",
    })
    .select("id")
    .single();
  assertNoError(externalPersonError, "insert external_people");
  const jakeId = must(externalPerson, "external person").id;

  // Aoife (self-authored, gi) — won by submission via the back.
  await seedBreakdown({
    authorId: athleteAuth.id,
    memberId: aoifeId,
    name: "Wednesday advanced sparring vs Conor",
    matchDate: addDaysUTC(today, -4),
    gi: true,
    result: "win",
    method: "submission",
    durationSeconds: 270,
    positions: [
      { position: "side_control", role: "top", start_ts: 0, end_ts: 45 },
      { position: "mount", role: "top", start_ts: 45, end_ts: 95 },
      { position: "back_control", role: "has_back", start_ts: 95, end_ts: 140 },
      { position: "standing_neutral", role: null, start_ts: 140, end_ts: 140 },
    ],
    events: [
      { event: "underhook_won", ts: 5 },
      { event: "takedown_attempt", modifier: "double", outcome: "completed", ts: 12 },
      { event: "guard_pass_attempt", modifier: "pressure", outcome: "completed", ts: 40 },
      { event: "back_take", ts: 95 },
      { event: "submission_attempt", modifier: "rnc", outcome: "finished", ts: 140 },
    ],
  });

  // Aoife (self-authored, no-gi) — lost to an armbar from mount.
  await seedBreakdown({
    authorId: athleteAuth.id,
    memberId: aoifeId,
    name: "No-gi open mat roll",
    matchDate: addDaysUTC(today, -10),
    gi: false,
    result: "loss",
    method: "submission",
    durationSeconds: 195,
    positions: [
      { position: "standing_neutral", role: null, start_ts: 0, end_ts: 20 },
      { position: "closed_guard", role: "playing", start_ts: 20, end_ts: 70 },
      { position: "half_guard", role: "bottom", start_ts: 70, end_ts: 120 },
      { position: "side_control", role: "bottom", start_ts: 120, end_ts: 165 },
      { position: "mount", role: "bottom", start_ts: 165, end_ts: 192 },
    ],
    events: [
      { event: "guard_pull", outcome: "to_closed", ts: 20 },
      { event: "sweep_attempt", modifier: "scissor", outcome: "defended", ts: 45 },
      { event: "guard_retention", outcome: "passed", ts: 68 },
      { event: "escape", outcome: "failed", ts: 115 },
      { event: "escape", outcome: "failed", ts: 185 },
      { event: "submission_defended", modifier: "armbar", outcome: "tapped", ts: 192 },
    ],
  });

  // Niamh (coach-authored, gi) — comp-team prep round, won on points.
  await seedBreakdown({
    authorId: coachAuth.id,
    memberId: niamhId,
    name: "Competition prep round vs Aisling",
    matchDate: addDaysUTC(today, -2),
    gi: true,
    result: "win",
    method: "points",
    durationSeconds: 300,
    positions: [
      { position: "standing_neutral", role: null, start_ts: 0, end_ts: 30 },
      { position: "open_guard", role: "passing", start_ts: 30, end_ts: 90 },
      { position: "side_control", role: "top", start_ts: 90, end_ts: 160 },
      { position: "mount", role: "top", start_ts: 160, end_ts: 220 },
      { position: "back_control", role: "has_back", start_ts: 220, end_ts: 280 },
      { position: "standing_neutral", role: null, start_ts: 280, end_ts: 280 },
    ],
    events: [
      { event: "takedown_attempt", modifier: "single", outcome: "completed", ts: 15 },
      { event: "guard_pass_attempt", modifier: "leg_drag", outcome: "completed", ts: 85 },
      { event: "guard_pass_attempt", modifier: "pressure", outcome: "completed", ts: 155 },
      { event: "back_take", ts: 220 },
      { event: "submission_attempt", modifier: "rnc", outcome: "defended", ts: 260 },
    ],
  });

  // Jake Sullivan (external person, coach-authored, no-gi) — scouting
  // footage from a regional open, won by decision.
  await seedBreakdown({
    authorId: coachAuth.id,
    externalPersonId: jakeId,
    name: "Scouting footage — regional open",
    matchDate: addDaysUTC(today, -6),
    gi: false,
    result: "win",
    method: "decision",
    durationSeconds: 180,
    positions: [
      { position: "standing_neutral", role: null, start_ts: 0, end_ts: 15 },
      { position: "closed_guard", role: "inside", start_ts: 15, end_ts: 70 },
      { position: "side_control", role: "top", start_ts: 70, end_ts: 130 },
      { position: "mount", role: "top", start_ts: 130, end_ts: 180 },
    ],
    events: [
      { event: "takedown_attempt", modifier: "throw", outcome: "completed", ts: 10 },
      { event: "guard_pass_attempt", modifier: "speed", outcome: "completed", ts: 65 },
      { event: "submission_attempt", modifier: "kimura", outcome: "defended", ts: 100 },
      { event: "guard_pass_attempt", modifier: "pressure", outcome: "completed", ts: 125 },
      { event: "submission_attempt", modifier: "armbar", outcome: "lost_position", ts: 160 },
    ],
  });

  console.log("\nDone.\n");
  console.log("Gym:", GYM_NAME, gymId);
  console.log("Members: 18 (1 owner, 1 coach, 16 athletes)");
  console.log("\nLogins:");
  console.log(`  Owner   ${OWNER_EMAIL}  (existing password unchanged)`);
  console.log(`  Coach   ${COACH_EMAIL}  password: ${coachAuth.password}`);
  console.log(`  Athlete ${DEMO_ATHLETE_EMAIL}  password: ${athleteAuth.password}`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err);
  process.exit(1);
});
