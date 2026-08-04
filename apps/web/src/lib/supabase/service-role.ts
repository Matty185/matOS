import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

/**
 * Service-role client — bypasses RLS entirely. Per CLAUDE.md Rule 4, this is
 * used ONLY for: invite token generation, the invite claim step (creating/
 * linking auth.users via the Admin API), audit log inserts, seeding, and the
 * two GDPR routes (`/api/account/export`, `/api/deletion-requests/[id]/
 * execute`) that need to read/write past a member's own RLS-visible slice —
 * e.g. export must include a coach-authored breakdown about a member that
 * the member's own session couldn't otherwise SELECT, and deletion-execute
 * must hard-delete rows no authenticated RLS policy grants DELETE on at all.
 * Stage S2 adds two more legitimate no-session-yet routes to this list:
 * `/api/signup` (creating the auth user, personal `gyms` row, and `members`
 * row before any session/RLS context exists — mirroring the invite-claim
 * step above) and the solo self-serve deletion route (hard-deleting rows no
 * authenticated policy grants DELETE on, same justification as GDPR
 * deletion-execute). Stage S3 adds `lib/share/resolve-share-link.ts`
 * (`/share/[token]`) — the app's first genuinely public page, no session
 * ever exists, and `share_links` deliberately has no public SELECT policy
 * at all (per its own S1 design note: resolution must go through a
 * controlled path, never a blanket RLS policy on the underlying tables).
 * Never used by the agent (it uses the RLS-respecting
 * client exclusively), and never for anything an ordinary authenticated
 * request could do via the RLS-respecting client instead.
 *
 * The `import "server-only"` above makes it a build error to import this
 * module from client code, on top of SUPABASE_SERVICE_ROLE_KEY never being
 * a NEXT_PUBLIC_ var in the first place.
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
