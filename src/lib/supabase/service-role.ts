import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client — bypasses RLS entirely. Per CLAUDE.md Rule 4, this is
 * used ONLY for: invite token generation, the invite claim step (creating/
 * linking auth.users via the Admin API), audit log inserts, and seeding.
 * Never used by the agent, and never for anything an ordinary authenticated
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
