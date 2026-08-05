import { useEffect, useRef, useState } from "react";
import { Text, View, Pressable, Animated } from "react-native";

// Fixed 5 categories (matching event_types.category's seeded values) + a
// standalone Position button — matos_tagging_ux_plan.md §2 ("never the
// full event grid on the rail, only entry points"). Docked to the bottom
// edge for mobile landscape, per the U-plan's mobile layout guidance.
export const CATEGORY_LABELS: Record<string, string> = {
  standing_wrestling: "Standing",
  guard_bottom: "Guard",
  top: "Top",
  attack_defence: "Attacks",
  misc: "Misc",
};
export const CATEGORY_ORDER = [
  "standing_wrestling",
  "guard_bottom",
  "top",
  "attack_defence",
  "misc",
];

const IDLE_FADE_MS = 3000;
const FULL_OPACITY = 1;
const FADED_OPACITY = 0.18;

export function CategoryRail({
  onSelectCategory,
  onSelectPosition,
}: {
  onSelectCategory: (category: string) => void;
  onSelectPosition: () => void;
}) {
  const opacity = useRef(new Animated.Value(FULL_OPACITY)).current;
  const [awake, setAwake] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function wake() {
    setAwake(true);
    Animated.timing(opacity, {
      toValue: FULL_OPACITY,
      duration: 150,
      useNativeDriver: true,
    }).start();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setAwake(false);
      Animated.timing(opacity, {
        toValue: FADED_OPACITY,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, IDLE_FADE_MS);
  }

  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{ opacity }}
      className="absolute bottom-0 left-0 right-0 flex-row justify-center gap-2 px-3 py-2"
      pointerEvents="box-none"
    >
      {/* Any tap on the rail itself wakes it to full opacity even when a
          button isn't the exact target (e.g. a near-miss between two
          faded buttons) before dispatching the actual selection. */}
      <Pressable
        onPress={wake}
        style={{ position: "absolute", inset: 0 }}
        pointerEvents={awake ? "none" : "auto"}
      />
      {CATEGORY_ORDER.map((category) => (
        <RailButton
          key={category}
          label={CATEGORY_LABELS[category]!}
          onPress={() => {
            wake();
            onSelectCategory(category);
          }}
        />
      ))}
      <RailButton
        label="Position"
        onPress={() => {
          wake();
          onSelectPosition();
        }}
      />
    </Animated.View>
  );
}

function RailButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-11 min-w-16 items-center justify-center rounded-full bg-black/60 px-3"
    >
      <Text className="font-sans-bold text-xs text-white">{label}</Text>
    </Pressable>
  );
}
