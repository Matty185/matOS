import { useState } from "react";
import { Alert, Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiDelete, type ApiErrorBody } from "@/lib/api";
import { ExternalPersonFormModal } from "@/components/external-person-form-modal";

type ExternalPerson = { id: string; display_name: string; notes: string | null };

// Mirrors apps/web's analysis/people/page.tsx.
export default function ExternalPeopleListScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: people,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["external-people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name, notes")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data as ExternalPerson[];
    },
  });

  function onSaved() {
    queryClient.invalidateQueries({ queryKey: ["external-people"] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await apiDelete(`/api/external-people/${id}`);
    setDeletingId(null);
    if (!result.ok) {
      Alert.alert(
        "Couldn't delete this person",
        (result.error as ApiErrorBody).error ?? "Something went wrong.",
      );
      return;
    }
    onSaved();
  }

  function confirmDelete(person: ExternalPerson) {
    Alert.alert(
      `Delete ${person.display_name}?`,
      "If this person has any logged matches, deletion will be blocked.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDelete(person.id) },
      ],
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-heading text-2xl tracking-wide text-primary">External People</Text>
          <ExternalPersonFormModal
            mode="create"
            onSaved={onSaved}
            trigger={(open) => (
              <Pressable
                onPress={open}
                className="h-11 items-center justify-center rounded-md bg-primary px-4"
              >
                <Text className="font-sans-bold text-sm text-white">+ Add</Text>
              </Pressable>
            )}
          />
        </View>

        {isLoading ? (
          <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
        ) : error ? (
          <Text className="font-sans text-sm text-red-600">
            Couldn&apos;t load external people. Pull to refresh.
          </Text>
        ) : !people || people.length === 0 ? (
          <View className="items-center gap-2 rounded-md border border-neutral-200 p-6">
            <Text className="font-sans-bold text-sm text-neutral-900">No external people yet</Text>
            <Text className="text-center font-sans text-sm text-neutral-600">
              Add training partners or opponents who don&apos;t have a MatOS account, so you can log
              matches about them.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {people.map((p) => (
              <View
                key={p.id}
                className="flex-row items-center justify-between gap-3 rounded-md border border-neutral-200 p-3"
              >
                <Pressable
                  className="flex-1 gap-0.5"
                  onPress={() => router.push(`/analysis/people/${p.id}`)}
                >
                  <Text className="font-sans-bold text-sm text-neutral-900">{p.display_name}</Text>
                  {p.notes ? (
                    <Text className="font-sans text-sm text-neutral-600" numberOfLines={1}>
                      {p.notes}
                    </Text>
                  ) : null}
                </Pressable>
                <View className="flex-row gap-2">
                  <ExternalPersonFormModal
                    mode="edit"
                    personId={p.id}
                    defaultValues={{ display_name: p.display_name, notes: p.notes ?? "" }}
                    onSaved={onSaved}
                    trigger={(open) => (
                      <Pressable
                        onPress={open}
                        className="h-11 w-11 items-center justify-center rounded-md border border-neutral-300"
                      >
                        <Text>✏️</Text>
                      </Pressable>
                    )}
                  />
                  <Pressable
                    onPress={() => confirmDelete(p)}
                    disabled={deletingId === p.id}
                    className="h-11 w-11 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-60"
                  >
                    <Text>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
