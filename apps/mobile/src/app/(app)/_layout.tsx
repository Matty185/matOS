import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/lib/auth-context";
import { useCurrentMember } from "@/lib/use-current-member";
import { usePushTokenRegistration, useNotificationHandling } from "@/lib/push-registration";

// Real tab shell, mirroring apps/web's ATHLETE_NAV (Home, Check In, My
// Progress, Analysis, Account). Tab icons are plain emoji glyphs rather
// than pulling in @expo/vector-icons for five icons.
export default function AppLayout() {
  const { session, isLoading } = useAuth();
  const { data: member } = useCurrentMember();
  usePushTokenRegistration(member);
  useNotificationHandling();

  if (isLoading) return null;
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0B1B33",
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
        name="analysis"
        options={{
          title: "Analysis",
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎥</Text>,
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
