import { useState } from "react";
import { Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentMember } from "@/lib/use-current-member";
import { useAthleteProfile } from "@/lib/use-athlete-profile";
import { BeltDisplay } from "@/components/belt-display";
import { ProfileBody } from "@/components/profile/profile-body";
import { ComparePickerModal } from "@/components/profile/compare-picker-modal";
import { ShareSheetModal } from "@/components/share/share-sheet-modal";

// Stage M5 — mirrors apps/web's analysis/athlete/[id]/page.tsx: a gym
// member's computed profile, reached today from a breakdown's focus-name
// link (analysis/[id]/index.tsx), same as web.
export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: currentMember, isPending: currentMemberPending } = useCurrentMember();

  const {
    data: member,
    isLoading: memberLoading,
    error,
  } = useQuery({
    queryKey: ["member", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, belt, stripes")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [gi, setGi] = useState(true);
  const {
    data: profileData,
    isLoading: profileLoading,
    error: profileError,
  } = useAthleteProfile({
    type: "member",
    id: id ?? "",
  });

  if (memberLoading || currentMemberPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (error || !member) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-center font-sans text-sm text-red-600">
          Couldn&apos;t load this member — they may not exist, or you may not have access to them.
        </Text>
      </SafeAreaView>
    );
  }

  // RLS on breakdowns already scopes what useAthleteProfile's query can
  // see (staff see all in gym, an athlete only their own-authored rows) —
  // this is a UX-layer check on top of that, matching web's exact gate, so
  // a random athlete hitting another member's profile route gets a clear
  // message instead of a confusingly empty profile.
  const isStaff = currentMember?.role === "coach" || currentMember?.role === "gym_owner";
  const isSelf = currentMember?.memberId === member.id;

  if (!isStaff && !isSelf) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-center font-sans text-sm text-red-600">
          You don&apos;t have access to this athlete&apos;s profile.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 p-4">
        <View className="flex-row items-center gap-3">
          <Text className="font-heading text-2xl tracking-wide text-primary">
            {member.first_name} {member.last_name}
          </Text>
          <BeltDisplay belt={member.belt} stripes={member.stripes} />
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
              subjectA={{ type: "member", id: member.id }}
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
                subjectId={member.id}
                displayName={`${member.first_name} ${member.last_name}`}
                isExternal={false}
                belt={member.belt}
                stripes={member.stripes}
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
      </ScrollView>
    </SafeAreaView>
  );
}
