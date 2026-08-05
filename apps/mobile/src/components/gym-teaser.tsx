import { Text, View } from "react-native";

// Mirrors apps/web/src/components/shared/gym-teaser.tsx's exact copy — a
// static marketing surface, not a functional workflow (matos_mobile_plan.md
// §1 "Solo user sees gym feature teasers... a deliberate growth mechanic").
// No shareable link/CTA yet — deferred until real self-serve gym creation
// exists to send someone to (see Stage M1's Decision Log entry). Emoji
// stands in for web's lucide Lightbulb icon rather than pulling in
// @expo/vector-icons for a single glyph.
export function GymTeaser() {
  return (
    <View className="flex-row items-start gap-3 rounded-md border border-dashed border-neutral-300 p-4">
      <Text className="mt-0.5 text-base">💡</Text>
      <View className="flex-1 gap-1">
        <Text className="font-sans-bold text-sm text-neutral-900">
          Your gym isn&apos;t on MatOS yet
        </Text>
        <Text className="font-sans text-sm text-neutral-600">
          Tell your coach about MatOS — once your gym signs up, they can invite you and your
          workspace stays exactly as it is.
        </Text>
      </View>
    </View>
  );
}
