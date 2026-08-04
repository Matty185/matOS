import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSupabaseClient } from "@matos/shared";

// The shared factory (packages/shared/src/supabase/client.ts) is
// deliberately thin — session persistence is platform-specific and stays
// here, not in the shared package: RN has no cookies at all, so the
// @supabase/ssr cookie-based approach apps/web uses doesn't apply.
// AsyncStorage + explicit auto-refresh is the standard Supabase-on-Expo
// pattern. `detectSessionInUrl: false` matters specifically here (not just
// a web-only concern) — RN has no browser URL bar to parse a session out
// of, and leaving Supabase's default on would make it try to.
//
// AsyncStorage's web implementation reaches for `window`/localStorage as
// soon as GoTrueClient's constructor touches it — Expo Router's web output
// still performs an initial server-side render pass (even though
// app.json's web.output is "static" for the eventual export), where
// `window` doesn't exist. A no-op stub during that pass is correct
// behavior, not a workaround: there's no session to recover on the server
// anyway, and the real client-side AsyncStorage takes over once the app
// hydrates in the browser.
const noopStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createSupabaseClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: typeof window === "undefined" ? noopStorage : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
