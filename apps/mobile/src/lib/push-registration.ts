import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import type { CurrentMember } from "@/lib/use-current-member";

// Stage M1 built token registration only; Stage M6 wires the actual sends
// (apps/web/src/lib/push/send-push.ts, called from the belt-promotion and
// breakdown-create routes) plus the two client-side pieces every push
// needs regardless of who triggers it: how it displays while the app is
// foregrounded, and what happens when it's tapped.
//
// Stage M9 (store compliance checklist, §3.4: "Push permission requested
// in context, not at launch") splits what M1 had bundled into one
// always-both function: `usePushTokenRegistration` (called unconditionally
// from the authenticated app shell on every mount) never shows the OS
// permission dialog — it only re-syncs the token if permission was
// already granted in some earlier session (keeps the token fresh across
// reinstalls/token rotation, which needs no user interaction and isn't a
// store-compliance concern). The actual permission *request* — the one
// that shows a system dialog — only happens from
// `requestPushPermissionAndRegister`, called from check-in.tsx after a
// real check-in succeeds, a genuine "you're actively using this app"
// moment rather than the first screen after signup. iOS/Android only ever
// show the system dialog once per install regardless of how many times
// requestPermissionsAsync is called, so calling this after every check-in
// (not just literally the first one ever) is safe and requires no extra
// first-time bookkeeping — subsequent calls silently resolve to the
// already-decided status with no repeat prompt.
//
// No real EAS projectId exists yet (Stage M0's own known gap —
// eas.json has no real project linked; `eas login`/`eas init` is an
// interactive step needing the developer's own Expo account). Without
// one, getExpoPushTokenAsync() cannot succeed — this fails soft (logs and
// returns) rather than crashing the app or blocking the screens that
// actually matter. This also means the sends this stage wires up can't be
// exercised end-to-end against a real device in this environment — the
// send-side logic and the client-side display/tap handling below are each
// independently correct and verified, but the full round trip is an
// honest verification gap, same class as every prior stage's "no native
// simulator available" limitation.
export function usePushTokenRegistration(member: CurrentMember | null | undefined) {
  useEffect(() => {
    if (!member) return;
    syncPushToken(member).catch((error) => {
      console.warn("[push] token sync skipped:", error);
    });
  }, [member?.memberId]);
}

// Mount-safe: never calls requestPermissionsAsync, so it never shows a
// system dialog. Only registers a token if permission was already granted
// in an earlier session.
async function syncPushToken(member: CurrentMember) {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;
  await obtainTokenAndUpsert(member);
}

// The contextual entry point (call from a real user action, never on
// mount) — this is the one that may show the OS permission dialog.
export async function requestPushPermissionAndRegister(member: CurrentMember) {
  if (!Device.isDevice) {
    // Simulators/emulators generally can't obtain a real push token —
    // nothing to register, not an error.
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  await obtainTokenAndUpsert(member);
}

async function obtainTokenAndUpsert(member: CurrentMember) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "[push] no EAS projectId configured (eas.json/app.json) — skipping token registration",
    );
    return;
  }

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

  const { error } = await supabase.from("push_tokens").upsert(
    {
      member_id: member.memberId,
      // gym_id is trigger-derived from member_id regardless (same pattern
      // as athlete_logs/belt_history/etc.) — supplied here anyway since
      // it's already resolved and the Insert type requires it, matching
      // how every web route with this same trigger still passes
      // context.gymId explicitly rather than omitting a "required" field.
      gym_id: member.gymId,
      expo_push_token: expoPushToken,
      platform,
    },
    { onConflict: "member_id,expo_push_token" },
  );

  if (error) {
    console.warn("[push] failed to register token:", error.message);
  }
}

// Each push this stage sends carries a `data.type` discriminator
// (belt_promotion | breakdown_shared) plus the id it's about — this maps
// a tap straight to the relevant screen instead of just opening the app
// to wherever it was last left. Route destinations mirror the same
// screens a user would navigate to manually for the same information
// (Progress for a promotion, the breakdown detail screen for a shared
// breakdown).
type PushData =
  { type: "belt_promotion"; memberId: string } | { type: "breakdown_shared"; breakdownId: string };

// Validates the companion id field too, not just the discriminant — a
// payload matching only `{ type: "breakdown_shared" }` (no breakdownId)
// would otherwise pass this guard and reach
// `router.push(\`/analysis/${data.breakdownId}\`)` as a silent
// "/analysis/undefined" dead link. Not reachable from either of this
// stage's two real senders today (both always include the field), but
// cheap to make hold for a future third sender too (Stage M6 gate fix,
// code-reviewer).
function isPushData(data: unknown): data is PushData {
  if (!data || typeof data !== "object" || !("type" in data)) return false;
  if (data.type === "belt_promotion") {
    return "memberId" in data && typeof data.memberId === "string";
  }
  if (data.type === "breakdown_shared") {
    return "breakdownId" in data && typeof data.breakdownId === "string";
  }
  return false;
}

// Sets the foreground display behavior once (expo-notifications' default,
// with no handler configured, is to NOT show anything while the app is
// open) and wires tap-to-navigate. Call once from the authenticated app
// shell, not per-screen — a second call would just replace the first
// handler harmlessly, but there's no reason to register it more than
// once.
export function useNotificationHandling() {
  const router = useRouter();

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (!isPushData(data)) return;
      if (data.type === "belt_promotion") {
        router.push("/progress");
      } else {
        router.push(`/analysis/${data.breakdownId}`);
      }
    });
    return () => subscription.remove();
  }, [router]);
}
