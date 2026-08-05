import { Stack } from "expo-router";

// Nested stack for the Analysis tab — list (index) is the tab root; new
// breakdown, breakdown detail, and external-people screens push on top of
// it. Mirrors apps/web's analysis/* route tree structurally (this app has
// no separate "people/new" route — matching web, creating an external
// person is a modal reachable from the people list, not its own screen).
export default function AnalysisLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerTintColor: "#1B4F72" }}>
      <Stack.Screen name="index" options={{ title: "Analysis", headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "Log a match" }} />
      <Stack.Screen name="[id]" options={{ title: "Breakdown" }} />
      <Stack.Screen name="people/index" options={{ title: "External People" }} />
      <Stack.Screen name="people/[id]" options={{ title: "Person" }} />
    </Stack>
  );
}
