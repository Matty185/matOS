import { useState } from "react";
import { Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAthleteProfile } from "@/lib/use-athlete-profile";
import { ProfileBody } from "@/components/profile/profile-body";
import { ComparePickerModal } from "@/components/profile/compare-picker-modal";
import { ShareSheetModal } from "@/components/share/share-sheet-modal";

type PersonBreakdown = {
  id: string;
  name: string;
  match_date: string;
  gi: boolean;
  status: "in_progress" | "complete";
};

// Mirrors apps/web's analysis/people/[id]/page.tsx — Stage M5 adds the
// computed profile (ProfileBody), Compare, and Share, closing the gap the
// M2-era comment on this file used to flag.
export default function ExternalPersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [gi, setGi] = useState(true);

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
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useAthleteProfile({ type: "external", id: id ?? "" });

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

        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setGi(true)}
              className={`h-11 items-center justify-center rounded-md px-4 ${gi ? "bg-primary" : "border border-neutral-300"}`}
            >
              <Text className={`font-sans-bold text-sm ${gi ? "text-white" : "text-neutral-900"}`}>
                Gi
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setGi(false)}
              className={`h-11 items-center justify-center rounded-md px-4 ${!gi ? "bg-primary" : "border border-neutral-300"}`}
            >
              <Text className={`font-sans-bold text-sm ${!gi ? "text-white" : "text-neutral-900"}`}>
                No-Gi
              </Text>
            </Pressable>
          </View>
          <View className="flex-row gap-2">
            <ComparePickerModal
              subjectA={{ type: "external", id: person.id }}
              trigger={(open) => (
                <Pressable
                  onPress={open}
                  className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
                >
                  <Text className="font-sans-bold text-sm text-neutral-900">Compare</Text>
                </Pressable>
              )}
            />
            {profileData ? (
              <ShareSheetModal
                type="profile"
                subjectId={person.id}
                displayName={person.display_name}
                isExternal
                belt={null}
                stripes={null}
                gi={profileData.gi}
                noGi={profileData.noGi}
                trigger={(open) => (
                  <Pressable
                    onPress={open}
                    className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
                  >
                    <Text className="font-sans-bold text-sm text-neutral-900">Share</Text>
                  </Pressable>
                )}
              />
            ) : null}
          </View>
        </View>

        {profileLoading ? (
          <Text className="font-sans text-sm text-neutral-600">Loading profile...</Text>
        ) : profileError || !profileData ? (
          <Text className="font-sans text-sm text-red-600">
            Couldn&apos;t load this profile. Try refreshing.
          </Text>
        ) : (
          <ProfileBody profile={gi ? profileData.gi : profileData.noGi} />
        )}

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
