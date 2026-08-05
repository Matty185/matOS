import { useRef, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import type { AthleteProfile, Database } from "@matos/shared";
import { apiPost, type ApiErrorBody } from "@/lib/api";
import { ShareCardContent, type ShareCardData } from "./share-card-content";

type BeltColor = Database["public"]["Enums"]["belt_color"];

type ShareSheetProps =
  | {
      type: "profile";
      subjectId: string;
      displayName: string;
      isExternal: boolean;
      belt: BeltColor | null;
      stripes: number | null;
      gi: AthleteProfile;
      noGi: AthleteProfile;
      trigger: (open: () => void) => React.ReactNode;
    }
  | {
      type: "breakdown";
      subjectId: string;
      name: string;
      matchDate: string;
      gi: boolean;
      result: "win" | "loss" | "draw" | null;
      method: "submission" | "points" | "decision" | "dq" | null;
      focusDisplayName: string;
      isExternalFocus: boolean;
      trigger: (open: () => void) => React.ReactNode;
    };

const REDACTED_NAME = "Training Partner";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

// RN port of apps/web's share-dialog.tsx, extended with an on-device
// shareable image (matos_mobile_plan.md §3.2: "Share cards: profile card +
// breakdown summary as image (IG/TikTok-ready) and public link"). The link
// half is byte-identical in spirit to web's: POST /api/share-links (zero
// backend work — withAuth + apps/mobile's existing Bearer-token forwarding
// already cover it), a fresh link generated per open, never reused. The
// image half is new: renders the same content shape as web's public share
// page (share/[token]/page.tsx) from data this screen already has
// authenticated access to — no need to round-trip through the public
// share-resolution endpoint just to build a picture of your own data.
export function ShareSheetModal(props: ShareSheetProps) {
  const [visible, setVisible] = useState(false);
  const [redactOpponents, setRedactOpponents] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);

  const isExternalSubject = props.type === "profile" ? props.isExternal : props.isExternalFocus;

  function close() {
    setVisible(false);
    setShareUrl(null);
    setCopied(false);
    setRedactOpponents(true);
  }

  async function handleGenerateLink() {
    setGenerating(true);
    try {
      const result = await apiPost("/api/share-links", {
        type: props.type,
        subject_id: props.subjectId,
        redact_opponents: redactOpponents,
      });
      if (!result.ok) {
        Alert.alert(
          "Couldn't generate a link",
          (result.error as ApiErrorBody).error ?? "Something went wrong.",
        );
        return;
      }
      const { token } = result.data as { token: string };
      setShareUrl(`${API_BASE_URL}/share/${token}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareLink() {
    if (!shareUrl) return;
    // RN's core Share API (not expo-sharing, which is file-URI-only) is
    // the right tool for sharing text/a URL — opens the same native share
    // sheet a captured image goes through, just with a link payload.
    await Share.share({ message: shareUrl, url: shareUrl });
  }

  async function handleShareImage() {
    setCapturing(true);
    try {
      const uri = await viewShotRef.current?.capture?.();
      if (!uri) {
        Alert.alert("Couldn't create the image", "Something went wrong — try again.");
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing isn't available", "This device can't open the share sheet.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch {
      Alert.alert("Couldn't share the image", "Something went wrong — try again.");
    } finally {
      setCapturing(false);
    }
  }

  const cardData: ShareCardData =
    props.type === "profile"
      ? {
          kind: "profile",
          displayName: props.isExternal && redactOpponents ? REDACTED_NAME : props.displayName,
          belt: props.belt,
          stripes: props.stripes,
          gi: props.gi,
          noGi: props.noGi,
        }
      : {
          kind: "breakdown",
          name: props.name,
          matchDate: props.matchDate,
          gi: props.gi,
          result: props.result,
          method: props.method,
          focusDisplayName:
            props.isExternalFocus && redactOpponents ? REDACTED_NAME : props.focusDisplayName,
        };

  return (
    <>
      {props.trigger(() => setVisible(true))}
      <Modal visible={visible} animationType="slide" onRequestClose={close}>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView contentContainerClassName="gap-6 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-heading text-2xl tracking-wide text-primary">
                Share {props.type === "profile" ? "profile" : "breakdown"}
              </Text>
              <Pressable onPress={close} className="h-11 items-center justify-center px-2">
                <Text className="font-sans-bold text-sm text-neutral-600">Close</Text>
              </Pressable>
            </View>

            {isExternalSubject ? (
              <Pressable
                onPress={() => setRedactOpponents((r) => !r)}
                className="flex-row items-start gap-2"
              >
                <View
                  className={`mt-0.5 h-5 w-5 items-center justify-center rounded border ${
                    redactOpponents ? "border-primary bg-primary" : "border-neutral-400"
                  }`}
                >
                  {redactOpponents ? <Text className="text-xs text-white">✓</Text> : null}
                </View>
                <Text className="flex-1 font-sans text-sm text-neutral-700">
                  Hide this training partner&apos;s real name on the public page and image
                  (recommended)
                </Text>
              </Pressable>
            ) : null}

            <View className="items-center">
              {/* Rendered at real size, not hidden off-screen — a live
                  preview of exactly what gets shared, redaction included.
                  ViewShot only needs the ref; nothing about visibility
                  affects capture correctness. */}
              <ViewShot
                ref={viewShotRef}
                options={{ format: "png", quality: 1, width: 1080, height: 1920 }}
              >
                <ShareCardContent data={cardData} />
              </ViewShot>
            </View>

            <Pressable
              onPress={handleShareImage}
              disabled={capturing}
              className="h-11 items-center justify-center rounded-md bg-primary px-4 disabled:opacity-60"
            >
              <Text className="font-sans-bold text-sm text-white">
                {capturing ? "Preparing..." : "Share image"}
              </Text>
            </Pressable>

            <View className="gap-3 border-t border-neutral-200 pt-4">
              <Text className="font-sans-bold text-sm text-neutral-900">Public link</Text>
              <Text className="font-sans text-xs text-neutral-500">
                Anyone with this link can view a read-only public page. Revoke it any time from
                Account.
              </Text>
              {shareUrl ? (
                <View className="gap-2">
                  <View className="rounded-md border border-neutral-300 p-3">
                    <Text className="font-sans text-sm text-neutral-900" selectable>
                      {shareUrl}
                    </Text>
                  </View>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={handleCopy}
                      className="h-11 flex-1 items-center justify-center rounded-md border border-neutral-300"
                    >
                      <Text className="font-sans-bold text-sm text-neutral-900">
                        {copied ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleShareLink}
                      className="h-11 flex-1 items-center justify-center rounded-md border border-neutral-300"
                    >
                      <Text className="font-sans-bold text-sm text-neutral-900">Share link</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={handleGenerateLink}
                  disabled={generating}
                  className="h-11 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-60"
                >
                  <Text className="font-sans-bold text-sm text-neutral-900">
                    {generating ? "Generating..." : "Generate link"}
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
