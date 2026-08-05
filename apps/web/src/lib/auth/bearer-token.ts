import "server-only";
import { headers } from "next/headers";

/**
 * Extracts the token from an `Authorization: Bearer <token>` header on the
 * current request, if present — apps/mobile has no cookies to carry a
 * session across origins, so it forwards its own Supabase access token
 * this way instead (see apps/mobile/src/lib/api.ts). Shared by
 * `lib/supabase/server.ts` (which client to construct) and `withAuth.ts`
 * (which `getUser()` call to make) so the two never drift out of sync on
 * what counts as a valid bearer header — they were originally two
 * independent copies of the same regex, caught in Stage M1's security
 * review as a maintainability hazard.
 */
export function getBearerToken(): string | undefined {
  return headers()
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1]
    ?.trim();
}
