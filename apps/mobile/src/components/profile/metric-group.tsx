import { Text, View } from "react-native";

// RN port of apps/web's metric-group.tsx — a titled card wrapper around a
// stack of metric rows, reused by both the single-profile screen and the
// comparison screen.
export function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2 rounded-md border border-neutral-200 p-4">
      <Text className="font-sans-bold text-sm text-neutral-900">{title}</Text>
      <View>{children}</View>
    </View>
  );
}
