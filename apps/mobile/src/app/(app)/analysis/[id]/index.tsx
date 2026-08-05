import { useState } from "react";
import { Alert, Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import * as ImagePicker from "expo-image-picker";
import { formatVideoTimestamp } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { apiDelete, apiPatch, type ApiErrorBody } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";
import { BreakdownEditModal } from "@/components/breakdown-edit-modal";

const RESULT_LABELS = { win: "Win", loss: "Loss", draw: "Draw" } as const;
const METHOD_LABELS = {
  submission: "Submission",
  points: "Points",
  decision: "Decision",
  dq: "DQ",
} as const;

type BreakdownDetail = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
  result: keyof typeof RESULT_LABELS | null;
  method: keyof typeof METHOD_LABELS | null;
  visibility: "private" | "gym";
  author_id: string | null;
  video_filename: string | null;
  video_duration_seconds: number | null;
  members: { first_name: string; last_name: string } | null;
  external_people: { display_name: string } | null;
};

// Mirrors apps/web's analysis/[id]/page.tsx, now handing off to Stage
// M3's real tagging player once a video is selected. Video selection uses
// expo-image-picker's gallery mode: the picked asset's local URI is
// never sent anywhere itself (Non-Negotiable #1 — video never touches the
// server) — only its filename + rounded duration get PATCHed, same two
// fields web's handleLoadedMetadata writes. The URI stays in this
// screen's own state and is handed forward as a route param when
// entering the player; it's never persisted (matching web's own
// Blob-URL-doesn't-survive-reload precedent — a fresh app session always
// needs a fresh pick, same "resume: re-select file" contract as web).
//
// "Record a roll" (Stage M4) is a separate entry point into
// analysis/[id]/record.tsx rather than another branch of handlePickVideo —
// it produces its own local file URI the same shape as a gallery pick,
// but PATCHes the breakdown and navigates into the tagging player itself
// (router.replace, not back through here), so this screen's own
// pickedVideoUri state is never set by the recording path.
export default function BreakdownDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: member } = useCurrentMember();
  const [deleting, setDeleting] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [pickedVideoUri, setPickedVideoUri] = useState<string | null>(null);

  const {
    data: breakdown,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["breakdown", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select(
          "id, name, match_date, gi, status, result, method, visibility, author_id, video_filename, video_duration_seconds, members(first_name, last_name), external_people(display_name)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as BreakdownDetail;
    },
  });

  async function handlePickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "MatOS needs access to your videos to select match footage.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const fileName = asset.fileName ?? asset.uri.split("/").pop() ?? "video";
    const durationSeconds = asset.duration ? Math.round(asset.duration / 1000) : null;

    setPickedFileName(fileName);
    setPickedVideoUri(asset.uri);
    setMismatchWarning(
      breakdown?.video_filename && breakdown.video_filename !== fileName
        ? `This doesn't look like the same file used last time — expected "${breakdown.video_filename}", got "${fileName}".`
        : null,
    );

    if (durationSeconds !== null) {
      if (
        breakdown?.video_duration_seconds != null &&
        Math.abs(durationSeconds - breakdown.video_duration_seconds) > 2
      ) {
        setMismatchWarning(
          (current) =>
            current ??
            `This video's length (${formatVideoTimestamp(durationSeconds)}) doesn't match what was used last time (${formatVideoTimestamp(breakdown.video_duration_seconds!)}).`,
        );
      }
    }

    // Best-effort, matching web's own handleLoadedMetadata — not shown to
    // the user either way, just records what this session used. Filename
    // is written unconditionally: some Android content-provider-backed
    // video sources return a null duration from expo-image-picker (unlike
    // an HTML5 <video>'s onLoadedMetadata, which web's equivalent code
    // waits on and which is always defined once it fires) — gating the
    // whole PATCH on a known duration meant the filename silently never
    // persisted for those, and the picked file appeared to "forget itself"
    // on the next screen visit with no explanation (Stage M2 code-review
    // finding).
    apiPatch(`/api/breakdowns/${id}`, {
      video_filename: fileName,
      ...(durationSeconds !== null
        ? { video_duration_seconds: durationSeconds, duration_seconds: durationSeconds }
        : {}),
    })
      .then((r) => {
        if (r.ok) queryClient.invalidateQueries({ queryKey: ["breakdown", id] });
      })
      .catch(() => {});
  }

  async function handleDelete() {
    if (!breakdown) return;
    setDeleting(true);
    const result = await apiDelete(`/api/breakdowns/${breakdown.id}`);
    if (!result.ok) {
      Alert.alert(
        "Couldn't delete this breakdown",
        (result.error as ApiErrorBody).error ?? "Something went wrong.",
      );
      setDeleting(false);
      return;
    }
    router.replace("/analysis");
  }

  function confirmDelete() {
    if (!breakdown) return;
    Alert.alert(
      `Delete "${breakdown.name}"?`,
      "This permanently deletes this breakdown and every position/event tagged in it. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: handleDelete },
      ],
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (error || !breakdown) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-center font-sans text-sm text-red-600">
          Couldn&apos;t load this breakdown — it may not exist, or you may not have access to it.
        </Text>
      </SafeAreaView>
    );
  }

  const focusName = breakdown.members
    ? `${breakdown.members.first_name} ${breakdown.members.last_name}`
    : (breakdown.external_people?.display_name ?? "Unknown");

  // RLS grants staff SELECT on every breakdown in the gym but write access
  // only on ones they authored — showing Edit/Delete unconditionally would
  // lead into controls whose save silently fails (RLS blocks it). Same
  // gate web's own detail page uses.
  const canEdit = !!member && breakdown.author_id === member.userId;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 p-4">
        <View className="gap-1">
          <Text className="font-heading text-2xl tracking-wide text-primary">{breakdown.name}</Text>
          <Text className="font-sans text-sm text-neutral-600">
            {focusName} · {format(new Date(breakdown.match_date), "MMM d, yyyy")}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          <Badge label={breakdown.gi ? "Gi" : "No-Gi"} />
          <Badge
            label={breakdown.status === "complete" ? "complete" : "in progress"}
            filled={breakdown.status === "complete"}
          />
          {breakdown.result ? <Badge label={RESULT_LABELS[breakdown.result]} /> : null}
          {breakdown.method ? <Badge label={METHOD_LABELS[breakdown.method]} /> : null}
          {breakdown.visibility === "private" ? <Badge label="Private" /> : null}
        </View>

        {canEdit ? (
          <View className="flex-row gap-2">
            <BreakdownEditModal
              breakdownId={breakdown.id}
              defaultValues={{
                name: breakdown.name,
                match_date: breakdown.match_date,
                gi: breakdown.gi,
                result: breakdown.result ?? undefined,
                method: breakdown.method ?? undefined,
                visibility: breakdown.visibility,
              }}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["breakdown", id] })}
              trigger={(open) => (
                <Pressable
                  onPress={open}
                  className="h-11 flex-1 items-center justify-center rounded-md border border-neutral-300"
                >
                  <Text className="font-sans-bold text-sm text-neutral-900">Edit</Text>
                </Pressable>
              )}
            />
            <Pressable
              onPress={confirmDelete}
              disabled={deleting}
              className="h-11 flex-1 items-center justify-center rounded-md bg-red-600 disabled:opacity-60"
            >
              <Text className="font-sans-bold text-sm text-white">
                {deleting ? "Deleting..." : "Delete"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-2 rounded-md border border-neutral-200 p-4">
          <Text className="font-sans-bold text-sm text-neutral-900">Video</Text>
          {pickedFileName || breakdown.video_filename ? (
            <Text className="font-sans text-sm text-neutral-600">
              {pickedFileName ?? breakdown.video_filename}
              {breakdown.video_duration_seconds
                ? ` · ${formatVideoTimestamp(breakdown.video_duration_seconds)}`
                : ""}
            </Text>
          ) : (
            <Text className="font-sans text-sm text-neutral-600">No video selected yet.</Text>
          )}
          {mismatchWarning ? (
            <Text className="font-sans text-sm text-amber-700">{mismatchWarning}</Text>
          ) : null}
          {canEdit ? (
            <View className="flex-row gap-2">
              <Pressable
                onPress={handlePickVideo}
                className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
              >
                <Text className="font-sans-bold text-sm text-neutral-900">
                  {breakdown.video_filename || pickedFileName
                    ? "Choose a different file"
                    : "Select video"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/analysis/[id]/record", params: { id: breakdown.id } })
                }
                className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
              >
                <Text className="font-sans-bold text-sm text-neutral-900">Record a roll</Text>
              </Pressable>
            </View>
          ) : null}
          <Text className="font-sans text-xs text-neutral-500">
            Video stays on your device — it&apos;s never uploaded anywhere.
          </Text>
        </View>

        {/* Tagging writes locally then syncs to the server through routes
            RLS already scopes to the author (breakdown_positions_all_author/
            breakdown_events_all_author) — but gating entry here too avoids
            a non-author opening the real player and generating local tags
            that would only ever fail to sync, silently stuck in that
            device's draft file (Stage M3 gate fix, security-reviewer). */}
        {canEdit ? (
          pickedVideoUri ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/analysis/[id]/tag",
                  params: { id: breakdown.id, videoUri: pickedVideoUri },
                })
              }
              className="h-11 items-center justify-center rounded-md bg-primary"
            >
              <Text className="font-sans-bold text-sm text-white">▶ Start tagging</Text>
            </Pressable>
          ) : (
            <View className="items-center gap-2 rounded-md border border-dashed border-neutral-300 p-6">
              <Text className="font-sans-bold text-sm text-neutral-900">
                Select a video to start tagging
              </Text>
              <Text className="text-center font-sans text-sm text-neutral-600">
                {breakdown.video_filename
                  ? "Pick the same video file again to resume — MatOS doesn't keep it between sessions."
                  : "Choose a video or record a roll above, then tagging opens automatically."}
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Badge({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <View
      className={`rounded-full px-2 py-1 ${filled ? "bg-primary" : "border border-neutral-300"}`}
    >
      <Text className={`font-sans text-xs ${filled ? "text-white" : "text-neutral-600"}`}>
        {label}
      </Text>
    </View>
  );
}
