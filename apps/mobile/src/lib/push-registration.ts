import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import type { CurrentMember } from "@/lib/use-current-member";

// Stage M1: token registration only — nothing sends a push notification
// until Stage M6 wires that up. Requesting permission in a genuinely
// contextual moment (M3.4's store-compliance checklist: "after first
// relevant event, not at launch") is also M6/M9's concern, not this one;
// registering on every authenticated app open is a reasonable interim
// default while nothing is actually sent yet.
//
// No real EAS projectId exists yet (Stage M0's own known gap —
// eas.json has no real project linked; `eas login`/`eas init` is an
// interactive step needing the developer's own Expo account). Without
// one, getExpoPushTokenAsync() cannot succeed — this fails soft (logs and
// returns) rather than crashing the app or blocking the screens that
// actually matter for this stage.
export function usePushTokenRegistration(member: CurrentMember | null | undefined) {
  useEffect(() => {
    if (!member) return;
    registerForPushNotifications(member).catch((error) => {
      console.warn("[push] registration skipped:", error);
    });
  }, [member?.memberId]);
}

async function registerForPushNotifications(member: CurrentMember) {
  if (!Device.isDevice) {
    // Simulators/emulators generally can't obtain a real push token —
    // nothing to register, not an error.
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn(
      "[push] no EAS projectId configured (eas.json/app.json) — skipping token registration",
    );
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

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
