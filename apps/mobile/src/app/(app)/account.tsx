import { useState } from "react";
import { Alert, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { apiPost, type ApiErrorBody } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";
import { clearCurrentUserDrafts } from "@/lib/tagging-draft";
import { clearCheckInQueueFor } from "@/lib/checkin-queue";

// Stage M9 (store compliance checklist §3.4: "In-app account deletion") —
// the sign-out-only version this screen shipped with since M1 was a real
// gap against a hard, well-known App Store rejection reason (guideline
// 5.1.1(v): any app that supports account creation must also support
// in-app account deletion). Ports apps/web's account/page.tsx
// DataPrivacyCard exactly (same three states, same two API routes) rather
// than inventing a new deletion mechanism — both delete-solo and
// delete-request are already-reviewed, already-live routes reached via
// the same Bearer-token pattern every other mobile write has used since
// Stage M1.
export default function AccountScreen() {
  const { data: member } = useCurrentMember();

  const { data: hasRealGymMembership, isPending: membershipPending } = useQuery({
    queryKey: ["has-real-gym-membership", member?.userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("memberships")
        .select("gyms(kind)")
        .eq("user_id", member!.userId)
        .eq("active", true);
      return data?.some((m) => m.gyms?.kind === "gym") ?? false;
    },
    enabled: !!member,
  });

  const isSolo = member?.gymKind === "personal";

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

        {member ? (
          <View className="gap-3 rounded-md border border-neutral-200 p-4">
            <Text className="font-sans-bold text-base text-neutral-900">Data & privacy</Text>
            {
              // Stage M9 gate fix (code-reviewer HIGH, security-reviewer
              // MEDIUM — same finding, independently caught twice):
              // hasRealGymMembership is a second query, not folded into
              // useCurrentMember() the way web's equivalent atomically
              // resolves both together — gating on its own isPending (not
              // just member being loaded) closes the window where a solo-
              // but-also-real-gym-member user would otherwise see the
              // immediate-delete button flash before the "you also belong
              // to a gym" warning replaces it. Matches this codebase's
              // established isPending-vs-isLoading precedent (Stage M1).
              membershipPending ? (
                <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
              ) : isSolo && hasRealGymMembership ? (
                <View className="rounded-md border border-amber-400 bg-amber-50 p-3">
                  <Text className="font-sans-bold text-sm text-neutral-900">
                    You also belong to a gym
                  </Text>
                  <Text className="font-sans text-sm text-neutral-700">
                    Account deletion for gym members goes through your coach&apos;s request flow —
                    switch to that gym to request it.
                  </Text>
                </View>
              ) : isSolo ? (
                <SoloDeleteAction userId={member.userId} />
              ) : (
                <GymDeleteRequestAction memberId={member.memberId} />
              )
            }
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// Gym-context: request-then-coach-executes, matching CLAUDE.md Rule 6 (gym
// data is anonymised, not hard-deleted, and a coach reviews it) — same
// shape as apps/web's GymDeleteRequestAction.
function GymDeleteRequestAction({ memberId }: { memberId: string }) {
  const [submitting, setSubmitting] = useState(false);

  const { data: pendingRequest, refetch } = useQuery({
    queryKey: ["pending-deletion-request", memberId],
    queryFn: async () => {
      const { data } = await supabase
        .from("deletion_requests")
        .select("requested_at")
        .eq("member_id", memberId)
        .is("executed_at", null)
        .maybeSingle();
      return data;
    },
  });

  async function handleDeleteRequest() {
    setSubmitting(true);
    const result = await apiPost("/api/account/delete-request", {});
    setSubmitting(false);
    if (!result.ok) {
      Alert.alert(
        "Couldn't submit request",
        (result.error as ApiErrorBody).error ?? "Something went wrong.",
      );
      return;
    }
    refetch();
  }

  function confirmRequest() {
    Alert.alert(
      "Request account deletion?",
      "Your coach will review and execute this. Once executed, your MatOS login is permanently deleted (you won't be able to sign in again), your personal details are anonymised, and your attendance, logs, and match breakdowns are permanently deleted. Payment and audit records are retained but anonymised.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Request deletion", style: "destructive", onPress: handleDeleteRequest },
      ],
    );
  }

  if (pendingRequest) {
    return (
      <View className="rounded-md border border-red-400 bg-red-50 p-3">
        <Text className="font-sans-bold text-sm text-red-700">Deletion requested</Text>
        <Text className="font-sans text-sm text-neutral-700">
          Submitted {format(new Date(pendingRequest.requested_at), "MMM d, yyyy")} — pending your
          coach&apos;s review.
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={confirmRequest}
      disabled={submitting}
      className="h-11 items-center justify-center rounded-md bg-red-600 px-4 disabled:opacity-60"
    >
      <Text className="font-sans-bold text-sm text-white">Request account deletion</Text>
    </Pressable>
  );
}

// Solo (personal-workspace-only) context: immediate, no coach review —
// there is no coach; this account IS the workspace owner. Scoped
// server-side too (api/account/delete-solo rejects anyone who also holds
// a real gym membership) — this button being shown at all already implies
// that, but the route never trusts the client's own gymKind read alone.
function SoloDeleteAction({ userId }: { userId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    const result = await apiPost("/api/account/delete-solo", {});
    if (!result.ok) {
      setSubmitting(false);
      Alert.alert(
        "Couldn't delete account",
        (result.error as ApiErrorBody).error ?? "Something went wrong.",
      );
      return;
    }
    try {
      // The account and all its breakdowns are already permanently gone
      // server-side at this point — clear the on-device artifacts the
      // confirm dialog's own "all your match breakdowns" promise covers.
      // Unlike sign-out (Stage M7's deliberate choice to leave the
      // check-in queue alone, since a dormant entry can flush once the
      // user signs back in), deletion is irreversible: this account can
      // never sign back in, so anything left under its storage key is
      // permanently orphaned, not dormant (Stage M9 gate fix,
      // security-reviewer).
      await clearCurrentUserDrafts().catch(() => {});
      await clearCheckInQueueFor(userId).catch(() => {});
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      // Stage M9 gate fix (code-reviewer, HIGH): the account is already
      // deleted server-side regardless of what happens here — a signOut()
      // network failure must never leave the button permanently stuck on
      // "Deleting...". Sending the user to /login directly is still
      // correct even if signOut() itself failed to complete: the deleted
      // account can no longer authenticate, so the local session is dead
      // weight either way.
      setSubmitting(false);
      router.replace("/login");
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently deletes your workspace and all your match breakdowns, and your MatOS login is removed immediately — you won't be able to sign in again. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDelete },
      ],
    );
  }

  return (
    <Pressable
      onPress={confirmDelete}
      disabled={submitting}
      className="h-11 items-center justify-center rounded-md bg-red-600 px-4 disabled:opacity-60"
    >
      <Text className="font-sans-bold text-sm text-white">
        {submitting ? "Deleting..." : "Delete my account"}
      </Text>
    </Pressable>
  );
}
