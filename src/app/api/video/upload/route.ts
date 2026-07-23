import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB per plan §5
// The 3/gym/day cap itself lives in the DB (enforce_analysis_daily_limit
// trigger), not here — see the insert below.

const MOCK_TECHNIQUES = [
  {
    name: "Guard retention",
    note: "Good hip movement, keep elbows tighter to the body on the recovery.",
  },
  {
    name: "Armbar from mount",
    note: "Solid isolation of the arm — work on controlling the far hip earlier.",
  },
  {
    name: "Takedown entry",
    note: "Level change looked strong; follow through faster on the finish.",
  },
  {
    name: "Back escape",
    note: "Nice hip bump — chain a second escape option if the first is stuffed.",
  },
];

function buildMockReport() {
  const picked = [...MOCK_TECHNIQUES].sort(() => Math.random() - 0.5).slice(0, 2);
  return {
    summary: "Automated placeholder analysis — no real video processing occurs in the alpha.",
    detected_techniques: picked,
    overall_notes:
      "This is a mock report. Real video analysis (technique detection, form scoring) is a later phase — MatOS never stores uploaded video either way; it's processed and discarded.",
  };
}

// POST /api/video/upload — any authenticated member, self only. Plan §5:
// "accepts multipart video <=500MB, validates type, never writes to
// storage, creates analyses row (pending), UI polls, row flips to complete
// with mock report. Upload limit: 3/gym/day."
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

  const supabase = createClient();

  // The 3/gym/day cap is enforced by a BEFORE INSERT trigger
  // (enforce_analysis_daily_limit, advisory-locked per gym+day) on the
  // analyses table itself, not application code — a plain "SELECT count(*)
  // then INSERT" here would be a check-then-act race under concurrent
  // uploads, the same bug class already fixed twice in this project (invite
  // attempt_count, agent rate_limit query_count), and an app-level-only
  // check can be bypassed entirely by any other insert path. The trigger
  // raises DAILY_UPLOAD_LIMIT_REACHED, which this maps to a 429.
  const { data: created, error: insertError } = await supabase
    .from("analyses")
    .insert({
      member_id: context.memberId,
      gym_id: context.gymId,
      title: file.name || "Training clip",
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
        "Your gym has reached today's limit of 3 video uploads.",
      );
    }
    console.error("[video upload] insert failed", insertError);
    return apiError(500, "UPLOAD_FAILED", "Something went wrong — the upload wasn't saved.");
  }

  // Simulated processing delay — see comment above.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const { data: completed, error: completeError } = await supabase
    .from("analyses")
    .update({
      status: "complete",
      analysed_at: new Date().toISOString(),
      report: buildMockReport(),
    })
    .eq("id", created.id)
    .select("id, title, status, analysed_at, report")
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
    afterState: { title: completed.title, status: completed.status },
    initiatedBy: "self_service",
  });

  return NextResponse.json({ success: true, analysis: completed }, { status: 201 });
});
