import { Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useCurrentMember } from "@/lib/use-current-member";
import { clearCurrentUserDrafts } from "@/lib/tagging-draft";

// Deliberately minimal for Stage M1 — full settings (contact edit, GDPR
// export, self-serve deletion) isn't in the plan's M0-M10 table at all
// under any stage; flagged as a sequencing gap in the Decision Log rather
// than either building it unscoped here or silently dropping sign-out
// capability, which M0's placeholder screen already had.
export default function AccountScreen() {
  const { data: member } = useCurrentMember();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="flex-1 gap-6 p-4">
        <Text className="font-heading text-3xl tracking-wide text-primary">Account</Text>

        {member ? (
          <View className="gap-1 rounded-md border border-neutral-200 p-4">
            <Text className="font-sans-bold text-base text-neutral-900">
              {member.firstName} {member.lastName}
            </Text>
            <Text className="font-sans text-sm text-neutral-600">
              {member.gymKind === "personal" ? "Personal workspace" : "Gym member"}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={async () => {
            // Best-effort: local tagging drafts are namespaced per-user
            // (Stage M3 gate fix) so they don't leak into a different
            // account's session on a shared device — this has to run
            // before signOut() while the session is still valid. A
            // failure here (e.g. nothing was ever drafted) must never
            // block sign-out itself.
            //
            // The offline check-in queue (Stage M7) is deliberately NOT
            // cleared here — per-user namespacing alone is what prevents
            // it leaking to a different account, not clearing it, and a
            // not-yet-synced entry represents a real completed action
            // (the athlete already tapped Check In) that unconditional
            // sign-out cleanup would otherwise silently discard (Stage M7
            // gate fix, security-reviewer). It sits dormant under this
            // account's own key until they sign back in and it flushes
            // normally.
            await clearCurrentUserDrafts().catch(() => {});
            await supabase.auth.signOut();
          }}
          className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
        >
          <Text className="font-sans-bold text-sm text-neutral-900">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
