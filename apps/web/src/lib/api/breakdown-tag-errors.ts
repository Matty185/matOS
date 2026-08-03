import type { PostgrestError } from "@supabase/supabase-js";

// Maps known DB-layer rejections from the breakdown_positions/events
// validation triggers (Stage A1) and their CHECK/unique constraints to
// clean 400/409s, instead of falling through to a generic 500 or (worse) a
// misleading 404 "not found." Found live-reachable in the Stage A3 review
// gate (database-reviewer): tag-edit-dialog's free-text start/end second
// inputs make breakdown_positions_end_after_start genuinely easy to
// trigger via normal editing, not just a hypothetical, and the positions
// routes had no mapping for it at all — only the events routes did, and
// only for the trigger-message cases, not the CHECK/unique-violation
// codes. One shared helper now covers both tables' routes.
//
// Message-substring matching (not Postgres error codes) for the
// trigger-raised cases specifically because validate_breakdown_position/
// validate_breakdown_event both raise with the same generic PL/pgSQL
// exception code (P0001) — there's no code-level way to distinguish
// "invalid modifier" from "invalid role" without restructuring those
// Stage A1 functions to use explicit SQLSTATEs, which is a larger change
// than this fix pass. Flagged by database-reviewer as a longer-term
// improvement, not required now.
export function mapBreakdownTagError(
  error: PostgrestError,
): { status: number; code: string; message: string } | null {
  if (error.code === "42501") {
    return { status: 403, code: "FORBIDDEN", message: "You don't have access to this tag." };
  }
  if (error.code === "23514") {
    return { status: 400, code: "INVALID_TIMESTAMPS", message: "End must be after start." };
  }
  if (error.code === "23505") {
    return {
      status: 409,
      code: "CONCURRENT_EDIT",
      message: "This was just changed elsewhere — refresh and try again.",
    };
  }
  if (
    error.message?.includes("is required for event type") ||
    error.message?.includes("is not valid for event type") ||
    error.message?.includes("is not valid for position") ||
    error.message?.includes("has no valid")
  ) {
    return { status: 400, code: "INVALID_TAG_DATA", message: error.message };
  }
  if (error.message?.includes("does not reference an existing")) {
    return { status: 400, code: "INVALID_REFERENCE", message: error.message };
  }
  return null;
}
