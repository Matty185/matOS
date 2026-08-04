import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth-context";

// Deliberately minimal for M0 (scaffold + auth screens only, per the
// plan's own build-sequence row) — a real tab shell (Home, Analysis,
// Account, gym teasers) is Stage M1's job. This just proves the
// authenticated route group + redirect gate works end to end.
export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (isLoading) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
