import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@matos/shared";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
