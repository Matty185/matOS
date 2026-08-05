import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseClient, type Database } from "@matos/shared";
import { getBearerToken } from "@/lib/auth/bearer-token";

/**
 * RLS-respecting server client for Server Components, Route Handlers, and
 * Server Actions. This is the client withAuth and every authenticated API
 * route uses — never the service-role client (CLAUDE.md Rule 4).
 *
 * Stage M1: apps/mobile has no cookies to carry a session across origins —
 * it forwards its own Supabase access token as `Authorization: Bearer
 * <token>` instead (see apps/mobile/src/lib/api.ts). When that header is
 * present, this returns a plain (non-SSR) client instead of the cookie-based
 * one, with the token wired into `global.headers` — that's what actually
 * scopes every `.from()`/`.rpc()` call made through it to that user's RLS
 * policies. withAuth separately validates the token itself via
 * `auth.getUser(token)` before trusting anything it resolves; this function
 * only decides *which* client to build, not whether the caller is real.
 * Every existing web call site keeps working unchanged — no header, no
 * bearer token, same cookie-based client as before.
 */
export function createClient() {
  const bearerToken = getBearerToken();

  if (bearerToken) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      },
    );
  }

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
