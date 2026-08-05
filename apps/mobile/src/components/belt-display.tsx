import { Text, View } from "react-native";
import { cn, BELT_STYLES, BELT_LABELS, type BeltColor } from "@matos/shared";

const SIZE_CLASSES = {
  sm: { bar: "h-3 w-10", dot: "h-1 w-1" },
  md: { bar: "h-4 w-14", dot: "h-1.5 w-1.5" },
  lg: { bar: "h-5 w-20", dot: "h-2 w-2" },
};

type BeltDisplayProps = {
  belt: BeltColor;
  stripes: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

// RN port of apps/web's belt-display.tsx, consuming the same shared
// BELT_STYLES/BELT_LABELS (packages/shared/src/belt/constants.ts) so both
// platforms render the identical belt taxonomy and colours — the one place
// belt colour + stripes ever get rendered, per CLAUDE.md UI Standards,
// applied per-platform.
export function BeltDisplay({ belt, stripes, size = "md", showLabel = false }: BeltDisplayProps) {
  const style = BELT_STYLES[belt];
  const sizing = SIZE_CLASSES[size];
  const clampedStripes = Math.max(0, Math.min(4, stripes));

  return (
    <View className="flex-row items-center gap-2">
      <View
        className={cn(
          "relative flex-row items-center justify-end gap-0.5 rounded-sm border",
          sizing.bar,
          style.base,
          style.border ?? "border-black/10",
        )}
      >
        {style.bar ? (
          <View className={cn("absolute inset-y-0 left-1/2 w-1/4 -translate-x-1/2", style.bar)} />
        ) : null}
        <View className="relative z-10 mr-1 flex-row gap-0.5 rounded-sm bg-black/70 px-1 py-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              className={cn(
                "rounded-full",
                sizing.dot,
                i < clampedStripes ? "bg-white" : "bg-white/25",
              )}
            />
          ))}
        </View>
      </View>
      {showLabel ? (
        <Text className="font-sans-bold text-sm text-neutral-900">{BELT_LABELS[belt]}</Text>
      ) : null}
    </View>
  );
}
