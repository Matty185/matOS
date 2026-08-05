import { Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useCurrentMember } from "@/lib/use-current-member";
import { GymTeaser } from "@/components/gym-teaser";

type BreakdownRow = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
  visibility: "private" | "gym";
  author_id: string | null;
  members: { first_name: string; last_name: string } | null;
  external_people: { display_name: string } | null;
  breakdown_events: { count: number }[];
};

// Mirrors apps/web's analysis/page.tsx: RLS scopes the row set by role
// already (athlete: own-authored only; coach/owner: everything in gym) —
// this screen doesn't re-filter, only adapts what it displays per role.
export default function AnalysisListScreen() {
  const router = useRouter();
  const { data: member, isPending: isMemberPending } = useCurrentMember();
  const isStaff = member?.role === "coach" || member?.role === "gym_owner";
  const isSolo = member?.gymKind === "personal";

  const {
    data: breakdowns,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["breakdowns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breakdowns")
        .select(
          "id, name, match_date, gi, status, visibility, author_id, members(first_name, last_name), external_people(display_name), breakdown_events(count)",
        )
        .order("match_date", { ascending: false });
      if (error) throw error;
      return data as unknown as BreakdownRow[];
    },
    enabled: !isMemberPending,
  });

  if (isMemberPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white" edges={["top"]}>
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View className="gap-1">
          <Text className="font-heading text-3xl tracking-wide text-primary">Analysis</Text>
          <Text className="font-sans text-sm text-neutral-600">
            {isSolo
              ? "Your logged match breakdowns."
              : isStaff
                ? "Match breakdowns across your gym."
                : "Your logged match breakdowns."}
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Link href="/analysis/people" asChild>
            <Pressable className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-md border border-neutral-300">
              <Text className="font-sans-bold text-sm text-neutral-900">👥 External people</Text>
            </Pressable>
          </Link>
          <Link href="/analysis/new" asChild>
            <Pressable className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-md bg-primary">
              <Text className="font-sans-bold text-sm text-white">+ Log a match</Text>
            </Pressable>
          </Link>
        </View>

        {isLoading ? (
          <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
        ) : error ? (
          <Text className="font-sans text-sm text-red-600">
            Couldn&apos;t load breakdowns. Pull to refresh.
          </Text>
        ) : !breakdowns || breakdowns.length === 0 ? (
          <View className="items-center gap-2 rounded-md border border-neutral-200 p-6">
            <Text className="font-sans-bold text-sm text-neutral-900">No breakdowns yet</Text>
            <Text className="text-center font-sans text-sm text-neutral-600">
              Log a match to start tagging positions and events.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {breakdowns.map((b) => {
              const focusName = b.members
                ? `${b.members.first_name} ${b.members.last_name}`
                : (b.external_people?.display_name ?? "Unknown");
              const eventCount = b.breakdown_events[0]?.count ?? 0;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/analysis/${b.id}`)}
                  className="flex-row items-center justify-between gap-3 rounded-md border border-neutral-200 p-3"
                >
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text className="font-sans-bold text-sm text-neutral-900">{b.name}</Text>
                      <View className="rounded-full border border-neutral-300 px-2 py-0.5">
                        <Text className="font-sans text-xs text-neutral-600">
                          {b.gi ? "Gi" : "No-Gi"}
                        </Text>
                      </View>
                      {b.visibility === "private" ? (
                        <View className="rounded-full border border-neutral-300 px-2 py-0.5">
                          <Text className="font-sans text-xs text-neutral-600">Private</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="font-sans text-xs text-neutral-600">
                      {focusName} · {format(new Date(b.match_date), "MMM d, yyyy")} · {eventCount}{" "}
                      {eventCount === 1 ? "event" : "events"}
                      {isStaff && b.author_id && b.author_id !== member?.userId
                        ? " · by another member"
                        : ""}
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
              );
            })}
          </View>
        )}

        {isSolo ? <GymTeaser /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
