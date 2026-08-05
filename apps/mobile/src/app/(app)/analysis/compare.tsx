import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { ProfileSubject } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { useAthleteProfile } from "@/lib/use-athlete-profile";
import { CompareBody } from "@/components/profile/compare-body";

function isSubjectType(value: string | undefined): value is ProfileSubject["type"] {
  return value === "member" || value === "external";
}

// UUID shape check on the two id params — not a security boundary (RLS
// is), just avoids sending an obviously-malformed id into a query. Mirrors
// apps/web's analysis/compare/page.tsx exactly.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function useSubjectName(subject: ProfileSubject | null) {
  return useQuery({
    queryKey: ["compare-subject-name", subject?.type, subject?.id],
    enabled: subject !== null,
    queryFn: async () => {
      if (!subject) return null;
      if (subject.type === "member") {
        const { data, error } = await supabase
          .from("members")
          .select("first_name, last_name")
          .eq("id", subject.id)
          .single();
        if (error) throw error;
        return `${data.first_name} ${data.last_name}`;
      }
      const { data, error } = await supabase
        .from("external_people")
        .select("display_name")
        .eq("id", subject.id)
        .single();
      if (error) throw error;
      return data.display_name;
    },
  });
}

function GiToggle({ gi, onChange }: { gi: boolean; onChange: (gi: boolean) => void }) {
  return (
    <View className="flex-row gap-2">
      <Pressable
        onPress={() => onChange(true)}
        className={`h-11 items-center justify-center rounded-md px-4 ${gi ? "bg-primary" : "border border-neutral-300"}`}
      >
        <Text className={`font-sans-bold text-sm ${gi ? "text-white" : "text-neutral-900"}`}>
          Gi
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange(false)}
        className={`h-11 items-center justify-center rounded-md px-4 ${!gi ? "bg-primary" : "border border-neutral-300"}`}
      >
        <Text className={`font-sans-bold text-sm ${!gi ? "text-white" : "text-neutral-900"}`}>
          No-Gi
        </Text>
      </Pressable>
    </View>
  );
}

// Stage M5 — mirrors apps/web's analysis/compare/page.tsx: a real
// shareable/reloadable route driven by params, not client-only view state
// (matching web's own "?aType=&aId=&bType=&bId=" URL contract, translated
// to expo-router's search params for a route with no dynamic segments).
export default function ComparePlayerScreen() {
  const params = useLocalSearchParams<{
    aType?: string;
    aId?: string;
    bType?: string;
    bId?: string;
  }>();
  const [gi, setGi] = useState(true);

  const valid =
    isSubjectType(params.aType) &&
    isSubjectType(params.bType) &&
    !!params.aId &&
    !!params.bId &&
    UUID_RE.test(params.aId) &&
    UUID_RE.test(params.bId) &&
    !(params.aType === params.bType && params.aId === params.bId);

  const subjectA: ProfileSubject | null =
    valid && isSubjectType(params.aType) && params.aId
      ? { type: params.aType, id: params.aId }
      : null;
  const subjectB: ProfileSubject | null =
    valid && isSubjectType(params.bType) && params.bId
      ? { type: params.bType, id: params.bId }
      : null;

  const { data: nameA, isLoading: nameALoading, error: nameAError } = useSubjectName(subjectA);
  const { data: nameB, isLoading: nameBLoading, error: nameBError } = useSubjectName(subjectB);
  const {
    data: dataA,
    isLoading: profileALoading,
    error: profileAError,
  } = useAthleteProfile(subjectA ?? { type: "member", id: "" }, { enabled: valid });
  const {
    data: dataB,
    isLoading: profileBLoading,
    error: profileBError,
  } = useAthleteProfile(subjectB ?? { type: "member", id: "" }, { enabled: valid });

  if (!valid || !subjectA || !subjectB) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white p-4">
        <Text className="text-center font-sans text-sm text-red-600">
          Missing or invalid comparison — pick who to compare from a profile screen.
        </Text>
      </SafeAreaView>
    );
  }

  const loading = nameALoading || nameBLoading || profileALoading || profileBLoading;
  const failed = nameAError || nameBError || profileAError || profileBError || !nameA || !nameB;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 p-4">
        {loading ? (
          <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
        ) : failed ? (
          <Text className="font-sans text-sm text-red-600">
            Couldn&apos;t load one of these profiles — they may not exist, or you may not have
            access to them.
          </Text>
        ) : (
          <>
            <Text className="font-heading text-2xl tracking-wide text-primary">
              {nameA} vs {nameB}
            </Text>
            <GiToggle gi={gi} onChange={setGi} />
            {dataA && dataB ? (
              <CompareBody
                nameA={nameA!}
                nameB={nameB!}
                profileA={gi ? dataA.gi : dataA.noGi}
                profileB={gi ? dataB.gi : dataB.noGi}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
