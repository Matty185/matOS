import type { PostgrestError } from "@supabase/supabase-js";
import { apiError } from "@/lib/api/response";

/**
 * Flow audit 9.3: maps a waiver_signatures insert error to a friendly
 * response, or null when it isn't one we expect.
 * 22023 — the version isn't the gym's current one (waiver_signatures_check).
 * 23505 — a live signature for this member and version already exists.
 */
export function mapWaiverSignatureError(error: PostgrestError | null) {
  if (error?.code === "22023") {
    return apiError(
      409,
      "WAIVER_OUTDATED",
      "The waiver has been updated since this page opened. Reload to see the current version.",
    );
  }
  if (error?.code === "23505") {
    return apiError(409, "ALREADY_SIGNED", "This waiver has already been signed for this member.");
  }
  return null;
}
