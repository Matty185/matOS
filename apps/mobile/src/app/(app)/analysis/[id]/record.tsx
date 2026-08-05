import { useEffect, useRef, useState } from "react";
import { Alert, Linking, Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKeepAwake } from "expo-keep-awake";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatVideoTimestamp } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { apiPatch } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";

// Stage M4 — matos_mobile_plan.md §3.3: "Recording flow: expo-camera
// capture → file lands in the same local pipeline as gallery picks →
// straight into tagging." Landscape-locked for the same reason the
// tagging player itself is (matos_mobile_plan.md's own "landscape-first
// fullscreen player" framing) — footage recorded here is reviewed and
// tagged in that same orientation, so locking capture to match avoids a
// portrait-clip-in-a-landscape-player mismatch. Camera/mic permissions
// are requested here, on entry to this screen, not at app launch — the
// same "in context" rule matos_mobile_plan.md §3.4 states for push
// permissions.
export default function RecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  useKeepAwake();

  const { data: member } = useCurrentMember();
  const { data: breakdown } = useQuery({
    queryKey: ["breakdown", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id, author_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Defense in depth, mirroring tag.tsx's own author check (Stage M3
  // gate fix pattern) — the breakdown detail screen only offers this
  // route's entry point to the author; this catches a direct/deep link.
  useEffect(() => {
    if (breakdown && member && breakdown.author_id !== member.userId) {
      router.back();
    }
  }, [breakdown, member, router]);

  // Skipped specifically when handing off into tag.tsx (handleStartTagging
  // sets this before router.replace): that screen locks landscape on its
  // own mount in the same navigation transition, and this cleanup's
  // portrait-restore firing at the same time raced it with no guaranteed
  // ordering — best case a visible flicker, worst case tagging opening
  // stuck in portrait (Stage M4 gate fix, code-reviewer).
  const handingOffToTaggingRef = useRef(false);
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      if (!handingOffToTaggingRef.current) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, []);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  // Requests once, the moment both permission objects have loaded from
  // null — not on every `.status` change. requestCameraPermission()'s own
  // resolution changes `.status` (undetermined → denied), so keying this
  // effect on status re-triggered itself: denying the very first native
  // prompt fired a second, fully automatic native prompt with no user tap
  // in between, for both camera and mic (up to 4 back-to-back system
  // dialogs before the "access needed" fallback ever rendered). The
  // "Grant access" button below is the sole retry path after this one
  // automatic pass (Stage M4 gate fix, code-reviewer).
  const hasAutoRequestedRef = useRef(false);
  useEffect(() => {
    if (hasAutoRequestedRef.current) return;
    if (!cameraPermission || !micPermission) return;
    hasAutoRequestedRef.current = true;
    if (!cameraPermission.granted && cameraPermission.canAskAgain) requestCameraPermission();
    if (!micPermission.granted && micPermission.canAskAgain) requestMicPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraPermission, micPermission]);

  const cameraRef = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [captured, setCaptured] = useState<{ uri: string; durationSeconds: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // The on-screen Close button is disabled while recording, but that only
  // guards the rendered Pressable — Android's hardware/gesture back
  // button bypassed it entirely and popped the screen instantly
  // (predictiveBackGestureEnabled: false in app.json makes this
  // unanimated), abandoning the in-flight recordAsync() promise with the
  // camera/mic session left in an unknown state. Intercepting the actual
  // navigation removal (not just the button) makes back-while-recording
  // do the same thing tapping the disabled Close button was always meant
  // to require: stop first (Stage M4 gate fix, code-reviewer).
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!isRecordingRef.current) return;
      e.preventDefault();
      cameraRef.current?.stopRecording();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    return () => {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      // Last-resort safety net for an exit path the beforeRemove listener
      // above doesn't cover (e.g. an OS-level activity teardown) — best
      // effort only, the camera view may already be gone by the time this
      // runs.
      if (isRecordingRef.current) cameraRef.current?.stopRecording();
    };
  }, []);

  async function handleStart() {
    if (!cameraRef.current || isRecording || !cameraReady) return;
    setIsRecording(true);
    startedAt.current = Date.now();
    setElapsed(0);
    elapsedTimer.current = setInterval(() => {
      if (startedAt.current) setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 250);

    try {
      // Resolves once stopRecording() is called (or a native limit is
      // hit) — the await here is the entire recording session, not a
      // single frame capture.
      const result = await cameraRef.current.recordAsync();
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      setIsRecording(false);
      if (result?.uri && startedAt.current) {
        const durationSeconds = Math.round((Date.now() - startedAt.current) / 1000);
        setCaptured({ uri: result.uri, durationSeconds });
      }
    } catch {
      if (elapsedTimer.current) clearInterval(elapsedTimer.current);
      setIsRecording(false);
      Alert.alert("Recording failed", "Something went wrong — try again.");
    }
  }

  function handleStop() {
    cameraRef.current?.stopRecording();
  }

  function handleRetake() {
    setCaptured(null);
    setElapsed(0);
  }

  async function handleStartTagging() {
    if (!captured || !id) return;
    setSaving(true);
    const fileName = captured.uri.split("/").pop() ?? "recording.mp4";
    // Best-effort, matching the gallery-pick pattern (index.tsx's
    // handlePickVideo) — not shown to the user either way, just
    // bookkeeping for the resume-mismatch check. The video URI itself is
    // never sent here or anywhere (Non-Negotiable #1) — only filename +
    // duration.
    await apiPatch(`/api/breakdowns/${id}`, {
      video_filename: fileName,
      video_duration_seconds: captured.durationSeconds,
      duration_seconds: captured.durationSeconds,
    }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["breakdown", id] });
    handingOffToTaggingRef.current = true;
    router.replace({
      pathname: "/analysis/[id]/tag",
      params: { id, videoUri: captured.uri },
    });
  }

  if (!cameraPermission || !micPermission) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-black">
        <Text className="font-sans text-sm text-white">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!cameraPermission.granted || !micPermission.granted) {
    // Once either permission is permanently denied (canAskAgain: false —
    // a second Android denial, or "don't ask again"), request*() resolves
    // immediately with no native dialog at all, so "Grant access" visibly
    // did nothing with zero explanation. Route to system settings instead
    // in that case (Stage M4 gate fix, code-reviewer).
    const permanentlyDenied = !cameraPermission.canAskAgain || !micPermission.canAskAgain;
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-black p-6">
        <Text className="text-center font-sans-bold text-base text-white">
          Camera and microphone access needed
        </Text>
        <Text className="text-center font-sans text-sm text-neutral-300">
          {permanentlyDenied
            ? "Camera and microphone access is turned off for MatOS. Enable both in your device Settings to record a roll."
            : "MatOS needs your camera to record a roll for tagging. Nothing is ever uploaded — the video stays on your device."}
        </Text>
        <Pressable
          onPress={() => {
            if (permanentlyDenied) {
              Linking.openSettings();
              return;
            }
            requestCameraPermission();
            requestMicPermission();
          }}
          className="h-11 items-center justify-center rounded-md bg-primary px-4"
        >
          <Text className="font-sans-bold text-sm text-white">
            {permanentlyDenied ? "Open Settings" : "Grant access"}
          </Text>
        </Pressable>
        <Pressable onPress={() => router.back()} className="h-11 items-center justify-center px-4">
          <Text className="font-sans-bold text-sm text-neutral-300">Cancel</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // A lightweight confirm step rather than an automatic hard-cut into
  // tagging: the plan's "record a roll → tag immediately" is preserved
  // for the normal path (one tap from here), but a mis-tap that stops
  // recording after a second or two would otherwise dump the user
  // straight into a tagging session for a useless clip with no way back
  // except deleting tags one by one.
  if (captured) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-6 bg-black p-6">
        <Text className="font-sans-bold text-lg text-white">
          Captured {formatVideoTimestamp(captured.durationSeconds)}
        </Text>
        <View className="flex-row flex-wrap items-center justify-center gap-4">
          {/* Distinct from Retake (which re-arms the camera for another
              take): this exits without recording anything, for someone
              who just wants out rather than to try again. */}
          <Pressable
            onPress={() => router.back()}
            disabled={saving}
            className="h-11 items-center justify-center px-2 disabled:opacity-60"
          >
            <Text className="font-sans-bold text-sm text-neutral-300">Discard</Text>
          </Pressable>
          <Pressable
            onPress={handleRetake}
            disabled={saving}
            className="h-11 items-center justify-center rounded-md border border-neutral-400 px-5 disabled:opacity-60"
          >
            <Text className="font-sans-bold text-sm text-white">Retake</Text>
          </Pressable>
          <Pressable
            onPress={handleStartTagging}
            disabled={saving}
            className="h-11 items-center justify-center rounded-md bg-primary px-5 disabled:opacity-60"
          >
            <Text className="font-sans-bold text-sm text-white">
              {saving ? "Saving..." : "▶ Start tagging"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        mode="video"
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />

      <SafeAreaView
        edges={["top"]}
        className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-3 py-2"
      >
        <Pressable
          onPress={() => router.back()}
          disabled={isRecording}
          className="h-11 items-center justify-center px-2 disabled:opacity-40"
        >
          <Text className="font-sans-bold text-sm text-white">✕ Close</Text>
        </Pressable>
        {isRecording ? (
          <View className="flex-row items-center gap-2 rounded-full bg-black/60 px-3 py-1.5">
            <View className="h-2.5 w-2.5 rounded-full bg-red-600" />
            <Text className="font-sans-bold text-sm text-white">
              {formatVideoTimestamp(elapsed)}
            </Text>
          </View>
        ) : null}
        <View className="w-16" />
      </SafeAreaView>

      <SafeAreaView
        edges={["bottom"]}
        className="absolute bottom-0 left-0 right-0 items-center pb-6"
      >
        <Pressable
          onPress={isRecording ? handleStop : handleStart}
          disabled={!cameraReady && !isRecording}
          className={`h-16 w-16 items-center justify-center rounded-full border-4 border-white disabled:opacity-40 ${
            isRecording ? "bg-red-600" : "bg-transparent"
          }`}
        >
          {isRecording ? (
            <View className="h-5 w-5 rounded-sm bg-white" />
          ) : (
            <View className="h-6 w-6 rounded-full bg-red-600" />
          )}
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
