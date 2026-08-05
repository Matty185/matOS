import { Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

type PersonBreakdown = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
};

// Mirrors apps/web's analysis/people/[id]/page.tsx minus ProfileView/
// ShareDialog — computed profiles and sharing are Stage M5 scope ("Profiles,
// comparison, share cards"), not built yet. Name/notes + breakdown list only.
export default function ExternalPersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const {
    data: person,
    isLoading: personLoading,
    error: personError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["external-person", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name, notes")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const {
    data: breakdowns,
    isLoading: breakdownsLoading,
    error: breakdownsError,
    refetch: refetchBreakdowns,
  } = useQuery({
    queryKey: ["breakdowns", "external-person", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select("id, name, match_date, gi, status")
        .eq("external_person_id", id)
        .order("match_date", { ascending: false });
      if (error) throw error;
      return data as PersonBreakdown[];
    },
  });

  if (personLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (personError || !person) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-center font-sans text-sm text-red-600">
          Couldn&apos;t load this person — they may not exist, or you may not have access to them.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              refetchBreakdowns();
            }}
          />
        }
      >
        <View className="gap-1">
          <Text className="font-heading text-2xl tracking-wide text-primary">
            {person.display_name}
          </Text>
          {person.notes ? (
            <Text className="font-sans text-sm text-neutral-600">{person.notes}</Text>
          ) : null}
        </View>

        <View className="gap-2">
          <Text className="font-sans-bold text-lg text-neutral-900">Breakdowns</Text>
          {breakdownsLoading ? (
            <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
          ) : breakdownsError ? (
            <Text className="font-sans text-sm text-red-600">
              Couldn&apos;t load breakdowns. Pull to refresh.
            </Text>
          ) : !breakdowns || breakdowns.length === 0 ? (
            <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
              <Text className="font-sans-bold text-sm text-neutral-900">No breakdowns yet</Text>
              <Text className="text-center font-sans text-sm text-neutral-600">
                Matches logged about this person will show up here.
              </Text>
            </View>
          ) : (
            <View className="gap-2">
              {breakdowns.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/analysis/${b.id}`)}
                  className="flex-row items-center justify-between gap-3 rounded-md border border-neutral-200 p-3"
                >
                  <View className="gap-0.5">
                    <Text className="font-sans-bold text-sm text-neutral-900">{b.name}</Text>
                    <Text className="font-sans text-xs text-neutral-600">
                      {format(new Date(b.match_date), "MMM d, yyyy")} · {b.gi ? "Gi" : "No-Gi"}
                    </Text>
                  </View>
                  <View
                    className={`rounded-full px-2 py-1 ${b.status === "complete" ? "bg-primary" : "border border-neutral-300"}`}
                  >
                    <Text
                      className={`font-sans text-xs ${b.status === "complete" ? "text-white" : "text-neutral-600"}`}
                    >
                      {b.status === "complete" ? "complete" : "in progress"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
