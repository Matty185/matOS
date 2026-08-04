import { Redirect, Stack, usePathname } from "expo-router";
import { useAuth } from "@/lib/auth-context";

export default function AuthLayout() {
  const { session, isLoading } = useAuth();
  const pathname = usePathname();
  // The invite deep link (matos://invite/<token>) is the attach flow's
  // whole reason for existing: a user already signed in on this device
  // tapping a coach's invite to link a second gym to their account. A
  // blanket redirect-when-signed-in here would bounce that exact case
  // straight to the placeholder home screen with no explanation.
  const isInviteRoute = pathname.startsWith("/invite/");

  // Waits for the initial session check rather than defaulting to
  // "unauthenticated" — otherwise an already-logged-in user briefly
  // flashes the login screen on every cold start before bouncing to (app).
  if (isLoading) return null;
  if (session && !isInviteRoute) return <Redirect href="/" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="invite/[token]" />
    </Stack>
  );
}
