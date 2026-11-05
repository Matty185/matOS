import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api/response";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { writeAuditLog } from "@/lib/audit/log";
import { resolveTrialGym, trialSessions } from "@/lib/trials/public";
import { notifyGymOfTrialRequest } from "@/lib/email/trial-notification";
import { trialRequestSchema } from "@matos/shared";

// POST /api/trial/[code] — PUBLIC (no session). Flow audit 9.1: a visitor
// asks to try a class. The gym comes only from the code; nothing is booked.
// Service role (Rule 4, same category as sign-up links): every query is
// scoped to that gym by hand.
//
// Abuse limits, no captcha (cheapest checks first):
// * a honeypot field;
// * per sender: a keyed one-way hash of the IP (never the IP itself);
// * per contact: email without its +tag, or the phone's last 9 digits;
// * per gym: requests in the last hour, and requests nobody has opened yet.
// If a link still gets flooded, the owner's "Change link" kills it.
const PER_SENDER_PER_DAY = 5;
const PER_CONTACT_PER_DAY = 3;
const PER_GYM_PER_HOUR = 30;
const MAX_NEW_PER_GYM = 200;

const GENERIC = "Something went wrong — please try again.";

/** "Ann+trial@X.ie" → "e:ann@x.ie"; "+353 87 123 4567" → "p:871234567". */
function contactKey(email: string | undefined, phone: string | undefined): string {
  if (email) {
    const [local = "", domain = ""] = email.toLowerCase().split("@");
    return `e:${local.split("+")[0]}@${domain}`;
  }
  const digits = (phone ?? "").replace(/\D/g, "");
  return `p:${digits.slice(-9)}`;
}

function senderHash(request: NextRequest): string | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ip || !key) return null;
  return createHmac("sha256", key).update(`trial-sender:${ip}`).digest("hex");
}

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  const gym = await resolveTrialGym(params.code ?? "");
  if (!gym) {
    return apiError(
      404,
      "LINK_NOT_FOUND",
      "This trial link isn't active. Contact the academy directly.",
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Check the form and try again.");
  }
  const parsed = trialRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }
  const input = parsed.data;

  // Honeypot: pretend it worked so bots don't learn to skip it, but log it
  // so a real person caught by it would at least be noticed.
  if (input.hp_field && input.hp_field.trim() !== "") {
    console.warn("[trial] honeypot hit", { gym: gym.id });
    return NextResponse.json({ success: true }, { status: 201 });
  }

  const supabase = createServiceRoleClient();
  const key = contactKey(input.email, input.phone);
  const source = senderHash(request);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(q).then((r) => {
      if (r.error) throw r.error;
      return r.count ?? 0;
    });
  const base = () =>
    supabase.from("trial_leads").select("id", { count: "exact", head: true }).eq("gym_id", gym.id);

  let counts: [number, number, number, number];
  try {
    counts = await Promise.all([
      source
        ? count(base().eq("source_hash", source).gte("created_at", dayAgo))
        : Promise.resolve(0),
      count(base().eq("contact_key", key).gte("created_at", dayAgo)),
      count(base().gte("created_at", hourAgo)),
      count(base().eq("status", "new")),
    ]);
  } catch {
    return apiError(500, "TRIAL_FAILED", GENERIC);
  }
  const [bySender, byContact, lastHour, openNew] = counts;
  if (byContact >= PER_CONTACT_PER_DAY || bySender >= PER_SENDER_PER_DAY) {
    return apiError(
      429,
      "ALREADY_REQUESTED",
      "We've already got your request — the academy will be in touch soon.",
    );
  }
  if (lastHour >= PER_GYM_PER_HOUR || openNew >= MAX_NEW_PER_GYM) {
    return apiError(
      429,
      "SLOW_DOWN",
      "The academy has had a lot of requests just now. Try again later.",
    );
  }

  // The chosen session must be one the page offered (the gym's own class,
  // running on that date, in the next two weeks). The DB checks the gym too.
  if (input.class_id && input.session_date) {
    let sessions;
    try {
      sessions = await trialSessions(gym);
    } catch {
      return apiError(500, "TRIAL_FAILED", GENERIC);
    }
    const ok = sessions.some((s) => s.classId === input.class_id && s.date === input.session_date);
    if (!ok) {
      return apiError(
        409,
        "SESSION_UNAVAILABLE",
        'That class isn\'t available any more. Pick another one, or choose "Not sure yet".',
      );
    }
  }

  const { data: lead, error } = await supabase
    .from("trial_leads")
    .insert({
      gym_id: gym.id,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      experience: input.experience,
      for_child: input.for_child,
      parent_name: input.for_child ? (input.parent_name ?? null) : null,
      message: input.message ?? null,
      class_id: input.class_id ?? null,
      session_date: input.session_date ?? null,
      contact_key: key,
      source_hash: source,
    })
    .select("id")
    .single();
  if (error || !lead) {
    console.error("[trial] insert failed", error?.code);
    return apiError(500, "TRIAL_FAILED", GENERIC);
  }

  // The sender hash is only needed for the day-long rate-limit window: clear
  // it from this gym's older requests (best effort, no scheduler needed).
  await supabase
    .from("trial_leads")
    .update({ source_hash: null })
    .eq("gym_id", gym.id)
    .lt("created_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
    .not("source_hash", "is", null);

  // Flow audit 7.4: email the gym, once a sending domain is switched on.
  // Never blocks or fails the request.
  let wantsLabel = "not sure yet";
  if (input.class_id && input.session_date) {
    const { data: cls } = await supabase
      .from("classes")
      .select("name")
      .eq("id", input.class_id)
      .eq("gym_id", gym.id)
      .maybeSingle();
    wantsLabel = `${cls?.name ?? "a class"} on ${input.session_date}`;
  }
  await notifyGymOfTrialRequest({
    to: gym.contactEmail,
    gymName: gym.name,
    visitorFirstName: input.first_name,
    forChild: input.for_child,
    wantsLabel,
    trialsUrl: `${process.env.NEXT_PUBLIC_APP_URL}/trials`,
  });

  // Best effort, like other self-service writes: the lead row is the record.
  // No personal details in the audit row.
  await writeAuditLog({
    gymId: gym.id,
    actorId: null,
    action: "trial.requested",
    entityType: "trial_leads",
    entityId: lead.id,
    afterState: { with_class: !!input.class_id, for_child: input.for_child },
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
