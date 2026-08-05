import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useCurrentMember } from "@/lib/use-current-member";
import { usePushTokenRegistration } from "@/lib/push-registration";

// Real tab shell for Stage M1, replacing M0's single-screen placeholder.
// Mirrors apps/web's ATHLETE_NAV (Home, Check In, My Progress, Account) —
// Analysis is Stage M2 scope, not added yet. Tab icons are plain emoji
// glyphs rather than pulling in @expo/vector-icons (not currently a
// dependency) for four icons.
export default function AppLayout() {
  const { session, isLoading } = useAuth();
  const { data: member } = useCurrentMember();
  usePushTokenRegistration(member);

  if (isLoading) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1B4F72",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: "Check In",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>✅</Text>,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📈</Text>,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
