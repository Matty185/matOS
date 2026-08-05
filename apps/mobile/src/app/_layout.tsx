import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { useAppFonts } from "@/lib/fonts";
import "../global.css";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Single root Stack, not a Tabs navigator — (auth) and (app) each define
// their own layout underneath this one (a plain auth stack, and the real
// tab shell built in Stage M1).
export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // app.json's own `orientation` is "default" (both allowed at the OS
  // level), not "portrait" — needed so the Stage M3 tagging player can
  // rotate to landscape at all (a fully portrait-locked app config
  // prevents expo-screen-orientation from ever landscaping, regardless of
  // what it's told at runtime). Every other screen wants portrait only,
  // so the default lives here at the root; the tagging player is the one
  // screen that overrides it locally (unlock on mount, re-lock on
  // unmount) rather than this needing to know about that screen at all.
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
