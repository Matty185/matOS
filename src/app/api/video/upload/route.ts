import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import type { Database } from "@/types/database";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB per plan §5
// The 3/gym/day cap itself lives in the DB (enforce_analysis_daily_limit
// trigger), scoped to method = 'ai_stub' only — see the migration comment.

type AnalysisEventType = Database["public"]["Enums"]["analysis_event_type"];
type AnalysisResult = Database["public"]["Enums"]["analysis_result"];
type AnalysisResultMethod = Database["public"]["Enums"]["analysis_result_method"];

const INSTANT_EVENT_TYPES: AnalysisEventType[] = [
  "underhook",
  "takedown",
  "takedown_defence",
  "guard_pull",
  "sweep",
  "submission_attempt",
  "submission",
  "escape",
  "reversal",
  "guard_pass",
];

const DURATION_EVENT_TYPES: AnalysisEventType[] = [
  "wrestling",
  "mount_control",
  "back_control",
  "side_control",
  "half_guard",
  "guard_bottom",
  "stalling",
];

type MockEvent = {
  event_type: AnalysisEventType;
  timestamp_seconds: number;
  duration_seconds: number | null;
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

// This is the AI-analysis stub — CLAUDE.md keeps real video analysis out
// of scope for the alpha, and the video is never stored regardless (this
// generates a plausible-looking hard-metrics event log, not a real
// detection pipeline). Same "mock, clearly a placeholder" spirit as the
// prose report this replaced, just in the new timestamped-event shape the
// rest of the feature is built around.
function buildMockEventLog(): {
  events: MockEvent[];
  durationSeconds: number;
  result: AnalysisResult;
  resultMethod: AnalysisResultMethod;
} {
  const events: MockEvent[] = [];
  const eventCount = Math.floor(Math.random() * 5) + 6; // 6-10 events
  let t = Math.floor(Math.random() * 15) + 5;

  for (let i = 0; i < eventCount; i++) {
    const isDurationEvent = Math.random() < 0.45;
    const type = pick(isDurationEvent ? DURATION_EVENT_TYPES : INSTANT_EVENT_TYPES);
    const duration = isDurationEvent ? Math.floor(Math.random() * 40) + 10 : null;
    events.push({ event_type: type, timestamp_seconds: t, duration_seconds: duration });
    t += (duration ?? 0) + Math.floor(Math.random() * 20) + 5;
  }

  const durationSeconds = t + Math.floor(Math.random() * 15) + 5;
  const hasSubmission = events.some((e) => e.event_type === "submission");
  const result: AnalysisResult = hasSubmission
    ? Math.random() < 0.6
      ? "win"
      : "loss"
    : pick<AnalysisResult>(["win", "loss", "draw"]);
  const resultMethod: AnalysisResultMethod = hasSubmission
    ? "submission"
    : pick<AnalysisResultMethod>(["points", "decision"]);

  return { events, durationSeconds, result, resultMethod };
}

// POST /api/video/upload — any authenticated member, self or (per the same
// RLS policies analyses already has) staff on behalf of an athlete. Plan
// §5: "accepts multipart video <=500MB, validates type, never writes to
// storage, creates analyses row (pending), UI polls, row flips to complete
// with mock report." "Mock report" is now a mock timestamped event log —
// hard metrics (takedowns, control time, submission attempts), not
// technique commentary — see the video-analysis rework plan.
//
// Simplified from a literal two-phase "pending -> later, a poll discovers
// complete" into one request that inserts pending, waits out a short
// simulated processing delay, then updates to complete and returns the
// final row. No background-job/queue infrastructure exists in this stack
// (out of scope per CLAUDE.md), and a client-orchestrated two-request dance
// (upload, then a separate "mark complete" call after a client-side delay)
// would leave an analysis stuck in 'pending' forever if the second call
// never fires — e.g. the athlete closes the tab mid-flow. A single request
// with a real server-side delay can't get stuck like that, at the cost of a
// slightly longer request instead of true async completion.
export const POST = withAuth(async (request, context) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError(400, "INVALID_BODY", "Expected a multipart video upload.");
  }

  const file = formData.get("video");
  if (!(file instanceof File)) {
    return apiError(400, "NO_FILE", "No video file was provided.");
  }
  if (!file.type.startsWith("video/")) {
    return apiError(400, "INVALID_FILE_TYPE", "That doesn't look like a video file.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return apiError(400, "FILE_TOO_LARGE", "Videos must be 500MB or smaller.");
  }

  const memberIdRaw = formData.get("member_id");
  const memberId = typeof memberIdRaw === "string" && memberIdRaw ? memberIdRaw : context.memberId;

  const supabase = createClient();

  // The 3/gym/day cap is enforced by a BEFORE INSERT trigger
  // (enforce_analysis_daily_limit, advisory-locked per gym+day, scoped to
  // method = 'ai_stub') on the analyses table itself, not application code
  // — a plain "SELECT count(*) then INSERT" here would be a check-then-act
  // race under concurrent uploads, the same bug class already fixed twice
  // in this project (invite attempt_count, agent rate_limit query_count),
  // and an app-level-only check can be bypassed entirely by any other
  // insert path. The trigger raises DAILY_UPLOAD_LIMIT_REACHED, mapped to
  // a 429 below.
  const { data: created, error: insertError } = await supabase
    .from("analyses")
    .insert({
      member_id: memberId,
      gym_id: context.gymId,
      title: file.name || "Training clip",
      method: "ai_stub",
      status: "pending",
      created_by: context.userId,
      visible_to_athlete: true,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    if (insertError?.message?.includes("DAILY_UPLOAD_LIMIT_REACHED")) {
      return apiError(
        429,
        "UPLOAD_LIMIT_REACHED",
        "Your gym has reached today's limit of 3 AI analyses today. Manual match logging has no daily limit.",
      );
    }
    if (insertError?.message?.includes("row-level security")) {
      return apiError(403, "FORBIDDEN", "You can't upload an analysis for that member.");
    }
    console.error("[video upload] insert failed", insertError);
    return apiError(500, "UPLOAD_FAILED", "Something went wrong — the upload wasn't saved.");
  }

  // Simulated processing delay — see comment above.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const mock = buildMockEventLog();

  // member_id/gym_id placeholders — see the comment on the equivalent
  // insert in /api/analyses/[id]/events; analysis_events_derive_ids
  // overwrites both from analysis_id before constraints/RLS are checked.
  const { error: eventsError } = await supabase.from("analysis_events").insert(
    mock.events.map((event) => ({
      analysis_id: created.id,
      member_id: memberId,
      gym_id: context.gymId,
      event_type: event.event_type,
      timestamp_seconds: event.timestamp_seconds,
      duration_seconds: event.duration_seconds,
      created_by: context.userId,
    })),
  );

  if (eventsError) {
    console.error("[video upload] event insert failed", eventsError);
    return apiError(
      500,
      "ANALYSIS_FAILED",
      "Something went wrong — the analysis couldn't be completed.",
    );
  }

  const { data: completed, error: completeError } = await supabase
    .from("analyses")
    .update({
      status: "complete",
      analysed_at: new Date().toISOString(),
      duration_seconds: mock.durationSeconds,
      result: mock.result,
      result_method: mock.resultMethod,
    })
    .eq("id", created.id)
    .select("id, title, status, analysed_at, method, duration_seconds, result, result_method")
    .single();

  if (completeError || !completed) {
    // The pending row still exists even though the flip failed — surface
    // this distinctly rather than the generic upload-failed message.
    return apiError(
      500,
      "ANALYSIS_FAILED",
      "Something went wrong — the analysis couldn't be completed.",
    );
  }

  await writeAuditLog({
    gymId: context.gymId,
    actorId: context.userId,
    action: "analysis.created",
    entityType: "analyses",
    entityId: created.id,
    afterState: { title: completed.title, status: completed.status, method: completed.method },
    initiatedBy: memberId === context.memberId ? "self_service" : "coach_manual",
  });

  return NextResponse.json({ success: true, analysis: completed }, { status: 201 });
});
