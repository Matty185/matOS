import type { ComponentType } from "react";
import { Text, View, Pressable } from "react-native";
import RawSlider from "@react-native-community/slider";
import type { SliderProps } from "@react-native-community/slider";
import { formatVideoTimestamp } from "@matos/shared";

// @react-native-community/slider is hoisted to the monorepo root (nothing
// forces it to nest under apps/mobile the way react-native-reanimated was
// in Stage M0 — no conflicting peer requirement), so its own .d.ts
// resolves @types/react from root's pinned copy (apps/web's React 18) —
// a different physical module than the React 19 apps/mobile's own code
// resolves. Re-typing the runtime import against our own correctly-
// resolved ComponentType sidesteps the cross-version structural mismatch
// at this one usage site, rather than fighting npm's hoisting algorithm
// again for a package with no natural reason to nest.
const Slider = RawSlider as unknown as ComponentType<SliderProps>;

const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;

// Fully custom controls (expo-video's native controls are disabled — see
// tagging-player.tsx) matching the tagging UX contract's speed range
// (0.25x-2x).
export function VideoControls({
  playing,
  currentTime,
  duration,
  playbackRate,
  onTogglePlay,
  onSeek,
  onSetPlaybackRate,
}: {
  playing: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onSetPlaybackRate: (rate: number) => void;
}) {
  return (
    <View className="gap-2 bg-black/70 px-3 py-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onTogglePlay}
          className="h-11 w-11 items-center justify-center rounded-full bg-white/10"
        >
          <Text className="text-lg text-white">{playing ? "⏸" : "▶"}</Text>
        </Pressable>

        <Text className="font-sans text-xs text-white">{formatVideoTimestamp(currentTime)}</Text>

        <Slider
          style={{ flex: 1, height: 44 }}
          minimumValue={0}
          maximumValue={Math.max(duration, 0.1)}
          value={currentTime}
          minimumTrackTintColor="#0B1B33"
          maximumTrackTintColor="#ffffff55"
          thumbTintColor="#ffffff"
          onSlidingComplete={onSeek}
        />

        <Text className="font-sans text-xs text-white">{formatVideoTimestamp(duration)}</Text>
      </View>

      <View className="flex-row justify-center gap-2">
        {SPEEDS.map((speed) => (
          <Pressable
            key={speed}
            onPress={() => onSetPlaybackRate(speed)}
            className={`h-11 items-center justify-center rounded-md px-3 ${
              playbackRate === speed ? "bg-primary" : "bg-white/10"
            }`}
          >
            <Text className="font-sans-bold text-xs text-white">{speed}x</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
