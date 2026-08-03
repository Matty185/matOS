import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@matos/shared";

/**
 * RLS-respecting server client for Server Components, Route Handlers, and
 * Server Actions. This is the client withAuth and every authenticated API
 * route uses — never the service-role client (CLAUDE.md Rule 4).
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — middleware handles session
            // refresh in that case, so this is safe to ignore.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Same as above.
          }
        },
      },
      // Explicit rather than relying on the browser's default-Lax behavior
      // for unset SameSite — asserted, not implicit, per Stage 2 security
      // review. secure only in production: required for the cookie to be
      // set at all over plain-HTTP localhost in dev.
      cookieOptions: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}
