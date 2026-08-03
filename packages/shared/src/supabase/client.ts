import { createClient, type SupabaseClientOptions } from "@supabase/supabase-js";
import type { Database } from "../types/database";

// Deliberately thin: the actual session-persistence strategy is platform-
// specific (cookies via @supabase/ssr for Next.js SSR on web, AsyncStorage/
// SecureStore for Expo on mobile) and stays in each app's own wrapper — see
// apps/web/src/lib/supabase/{client,server}.ts, which call @supabase/ssr's
// own createBrowserClient/createServerClient directly rather than through
// this factory, since those already are the correct web-SSR factory and
// re-implementing their cookie handling here would just be indirection.
// What this centralizes is the one thing both platforms genuinely share:
// the Database-typed generic wired to @supabase/supabase-js's createClient,
// so neither platform can drift from the schema types the other uses.
//
// The service-role client is NOT here and never will be — it stays in
// apps/web only (src/lib/supabase/service-role.ts), so a service-role key
// is never reachable from any package the mobile app also depends on, even
// indirectly via workspace resolution.
export function createSupabaseClient(
  url: string,
  anonKey: string,
  options?: SupabaseClientOptions<"public">,
) {
  return createClient<Database>(url, anonKey, options);
}
