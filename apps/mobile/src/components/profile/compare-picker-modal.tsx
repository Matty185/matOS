import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { ProfileSubject } from "@matos/shared";
import { supabase } from "@/lib/supabase";

function useGymMembers(enabled: boolean) {
  return useQuery({
    queryKey: ["gym-members-active"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("active", true)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useExternalPeople(enabled: boolean) {
  return useQuery({
    queryKey: ["external-people"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// RN port of apps/web's compare-picker-dialog.tsx — subject A is whichever
// profile the user is already viewing; this only picks subject B, then
// hands both off to /analysis/compare via query params (same reasoning as
// web: a plain shareable/reloadable route, not client-only view state).
export function ComparePickerModal({
  subjectA,
  trigger,
}: {
  subjectA: ProfileSubject;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState<"member" | "external">("member");
  const [selectedId, setSelectedId] = useState("");

  const { data: members } = useGymMembers(visible && kind === "member");
  const { data: externalPeople } = useExternalPeople(visible && kind === "external");

  function close() {
    setVisible(false);
    setKind("member");
    setSelectedId("");
  }

  function handleCompare() {
    if (!selectedId) return;
    router.push({
      pathname: "/analysis/compare",
      params: { aType: subjectA.type, aId: subjectA.id, bType: kind, bId: selectedId },
    });
    close();
  }

  const options =
    kind === "member"
      ? (members ?? [])
          .filter((m) => !(subjectA.type === "member" && subjectA.id === m.id))
          .map((m) => ({ id: m.id, label: `${m.first_name} ${m.last_name}` }))
      : (externalPeople ?? [])
          .filter((p) => !(subjectA.type === "external" && subjectA.id === p.id))
          .map((p) => ({ id: p.id, label: p.display_name }));

  return (
    <>
      {trigger(() => setVisible(true))}
      <Modal visible={visible} animationType="slide" onRequestClose={close}>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView contentContainerClassName="gap-6 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-heading text-2xl tracking-wide text-primary">
                Compare profiles
              </Text>
              <Pressable onPress={close} className="h-11 items-center justify-center px-2">
                <Text className="font-sans-bold text-sm text-neutral-600">Close</Text>
              </Pressable>
            </View>

            <View className="gap-2">
              <Text className="font-sans-bold text-sm text-neutral-900">Compare against</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => {
                    setKind("member");
                    setSelectedId("");
                  }}
                  className={`h-11 flex-1 items-center justify-center rounded-md ${
                    kind === "member" ? "bg-primary" : "border border-neutral-300"
                  }`}
                >
                  <Text
                    className={`font-sans-bold text-sm ${kind === "member" ? "text-white" : "text-neutral-900"}`}
                  >
                    A gym member
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setKind("external");
                    setSelectedId("");
                  }}
                  className={`h-11 flex-1 items-center justify-center rounded-md ${
                    kind === "external" ? "bg-primary" : "border border-neutral-300"
                  }`}
                >
                  <Text
                    className={`font-sans-bold text-sm ${kind === "external" ? "text-white" : "text-neutral-900"}`}
                  >
                    External person
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="gap-2">
              <Text className="font-sans-bold text-sm text-neutral-900">Who</Text>
              {options.length === 0 ? (
                <Text className="font-sans text-sm text-neutral-600">
                  {kind === "member" ? "No other active members." : "No external people yet."}
                </Text>
              ) : (
                <View className="gap-2">
                  {options.map((o) => (
                    <Pressable
                      key={o.id}
                      onPress={() => setSelectedId(o.id)}
                      className={`h-11 items-center justify-center rounded-md border px-4 ${
                        selectedId === o.id ? "border-primary bg-primary/10" : "border-neutral-300"
                      }`}
                    >
                      <Text className="font-sans text-sm text-neutral-900">{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <Pressable
              onPress={handleCompare}
              disabled={!selectedId}
              className="h-11 items-center justify-center rounded-md bg-primary disabled:opacity-40"
            >
              <Text className="font-sans-bold text-sm text-white">Compare</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
