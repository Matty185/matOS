import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { useAppFonts } from "@/lib/fonts";
import "../global.css";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Single root Stack, not a Tabs navigator — the (auth) and (app) route
// groups each define their own layout underneath this one (a plain auth
// stack, and a minimal placeholder shell respectively; the real tab
// navigation for the authenticated app is Stage M1's job, not M0's —
// this stage is scaffold + auth screens only, per the plan's own M0 row).
export default function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

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
