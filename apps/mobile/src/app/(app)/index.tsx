import { Text, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center gap-4 p-4">
        <Text className="font-heading text-3xl tracking-wide text-primary">MatOS</Text>
        <Text className="font-sans text-base text-neutral-600">
          You&apos;re signed in. The real athlete portal lands in Stage M1.
        </Text>
        <Pressable
          onPress={() => supabase.auth.signOut()}
          className="h-11 min-w-32 items-center justify-center rounded-md bg-primary px-4"
        >
          <Text className="font-sans-bold text-base text-white">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
