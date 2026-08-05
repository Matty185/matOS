import { useState } from "react";
import { Alert, Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, differenceInCalendarWeeks } from "date-fns";
import { supabase } from "@/lib/supabase";
import { apiDelete, type ApiErrorBody } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";
import { BeltDisplay } from "@/components/belt-display";
import { GymTeaser } from "@/components/gym-teaser";
import { LogFormModal } from "@/components/log-form-modal";

type LogRow = {
  id: string;
  entry_date: string;
  working_on: string | null;
  struggling_with: string | null;
  notes: string | null;
  visible_to_coach: boolean;
};

const TABS = [
  { key: "attendance", label: "Attendance" },
  { key: "belts", label: "Belt History" },
  { key: "logs", label: "Logs" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Mirrors apps/web's progress-client.tsx: same 3 tabs (Attendance defaults
// active, matching web), same queries. Attendance/Belt History show the
// gym teaser for solo users (no gym = no attendance/belt data ever
// possible); Logs works normally regardless — a solo athlete self-
// journaling training notes has nothing to do with gym membership.
export default function ProgressScreen() {
  const [tab, setTab] = useState<TabKey>("attendance");
  const { data: member, isPending: isMemberPending } = useCurrentMember();
  const isSolo = member?.gymKind === "personal";

  // Gated on the member lookup's own pending state — see Home screen's
  // identical comment (Stage M1 code-review finding): isSolo would
  // otherwise default to false while member is still resolving, briefly
  // showing the gym-member tabs (and, inside them, a premature empty
  // state, since their own enabled: !!memberId gate has the same
  // isPending-vs-isLoading gap) to solo users too. Gating here means
  // AttendanceTab/BeltHistoryTab only ever mount once memberId is already
  // known, so their own queries are enabled from their very first render.
  if (isMemberPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white" edges={["top"]}>
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
      <View className="gap-4 p-4 pb-0">
        <Text className="font-heading text-3xl tracking-wide text-primary">My Progress</Text>
        <View className="flex-row gap-2">
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className={`h-9 flex-1 items-center justify-center rounded-md ${
                tab === t.key ? "bg-primary" : "border border-neutral-300"
              }`}
            >
              <Text
                className={`font-sans-bold text-xs ${tab === t.key ? "text-white" : "text-neutral-700"}`}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === "attendance" ? (
        isSolo ? (
          <View className="p-4">
            <GymTeaser />
          </View>
        ) : (
          <AttendanceTab memberId={member?.memberId} />
        )
      ) : tab === "belts" ? (
        isSolo ? (
          <View className="p-4">
            <GymTeaser />
          </View>
        ) : (
          <BeltHistoryTab memberId={member?.memberId} />
        )
      ) : (
        <LogsTab memberId={member?.memberId} />
      )}
    </SafeAreaView>
  );
}

function AttendanceTab({ memberId }: { memberId?: string }) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["my-attendance", memberId],
    queryFn: async () => {
      const [{ data: attendance, error }, { data: memberRow }] = await Promise.all([
        supabase
          .from("attendance")
          .select("checked_in_at, checked_in_by")
          .eq("member_id", memberId!)
          .order("checked_in_at", { ascending: false })
          .limit(50),
        supabase.from("members").select("join_date").eq("id", memberId!).single(),
      ]);
      if (error) throw error;
      return {
        attendance,
        joinDate: memberRow?.join_date ?? new Date().toISOString().slice(0, 10),
      };
    },
    enabled: !!memberId,
  });

  const weeksSinceJoin = data
    ? Math.max(1, differenceInCalendarWeeks(new Date(), new Date(data.joinDate)))
    : 1;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 p-4"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {isLoading ? (
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      ) : !data || data.attendance.length === 0 ? (
        <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
          <Text className="font-sans-bold text-sm text-neutral-900">
            No attendance recorded yet
          </Text>
          <Text className="text-center font-sans text-sm text-neutral-600">
            Check in to a class and your history will show up here.
          </Text>
        </View>
      ) : (
        <>
          <View className="rounded-md border border-neutral-200 p-3">
            <Text className="font-sans text-xs text-neutral-600">Average per week</Text>
            <Text className="font-sans-bold text-2xl text-neutral-900">
              {(data.attendance.length / weeksSinceJoin).toFixed(1)}
            </Text>
          </View>
          <View className="gap-2">
            {data.attendance.map((row, i) => (
              <View
                key={i}
                className="flex-row items-center justify-between rounded-md border border-neutral-200 p-3"
              >
                <Text className="flex-1 font-sans text-sm text-neutral-900">
                  {format(new Date(row.checked_in_at), "EEE, MMM d, yyyy 'at' h:mm a")}
                </Text>
                <Text className="font-sans text-sm text-neutral-600">
                  {row.checked_in_by === "self" ? "Self check-in" : "Marked by coach"}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function BeltHistoryTab({ memberId }: { memberId?: string }) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["my-belt-history", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("belt_history")
        .select("belt, stripes, promoted_at, notes")
        .eq("member_id", memberId!)
        .order("promoted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-2 p-4"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {isLoading ? (
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      ) : !data || data.length === 0 ? (
        <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
          <Text className="font-sans-bold text-sm text-neutral-900">
            No promotions recorded yet
          </Text>
          <Text className="text-center font-sans text-sm text-neutral-600">
            Your belt promotions will appear here as a timeline.
          </Text>
        </View>
      ) : (
        data.map((row, i) => (
          <View key={i} className="gap-1 rounded-md border border-neutral-200 p-3">
            <View className="flex-row items-center justify-between">
              <BeltDisplay belt={row.belt} stripes={row.stripes} size="sm" showLabel />
              <Text className="font-sans text-xs text-neutral-600">
                {format(new Date(row.promoted_at), "MMM d, yyyy")}
              </Text>
            </View>
            {row.notes ? (
              <Text className="font-sans text-sm text-neutral-600">{row.notes}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function LogsTab({ memberId }: { memberId?: string }) {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["my-logs", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athlete_logs")
        .select("id, entry_date, working_on, struggling_with, notes, visible_to_coach")
        .eq("member_id", memberId!)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data as LogRow[];
    },
    enabled: !!memberId,
  });

  function onSaved() {
    queryClient.invalidateQueries({ queryKey: ["my-logs", memberId] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await apiDelete(`/api/logs/${id}`);
    setDeletingId(null);
    if (!result.ok) {
      Alert.alert(
        "Couldn't delete entry",
        (result.error as ApiErrorBody).error ?? "Something went wrong.",
      );
      return;
    }
    onSaved();
  }

  function confirmDelete(id: string) {
    Alert.alert("Delete this entry?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => handleDelete(id) },
    ]);
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-3 p-4"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <LogFormModal
        mode="create"
        onSaved={onSaved}
        trigger={(open) => (
          <Pressable
            onPress={open}
            className="h-11 w-40 items-center justify-center rounded-md bg-primary px-4"
          >
            <Text className="font-sans-bold text-sm text-white">Add log entry</Text>
          </Pressable>
        )}
      />

      {isLoading ? (
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      ) : !data || data.length === 0 ? (
        <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
          <Text className="font-sans-bold text-sm text-neutral-900">No log entries yet</Text>
          <Text className="text-center font-sans text-sm text-neutral-600">
            Track what you&apos;re working on and struggling with after each session.
          </Text>
        </View>
      ) : (
        data.map((row) => (
          <View key={row.id} className="gap-2 rounded-md border border-neutral-200 p-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans text-xs text-neutral-600">
                {format(new Date(`${row.entry_date}T00:00:00`), "MMM d, yyyy")}
                {!row.visible_to_coach ? " · Private" : ""}
              </Text>
              <View className="flex-row gap-2">
                <LogFormModal
                  mode="edit"
                  log={row}
                  onSaved={onSaved}
                  trigger={(open) => (
                    <Pressable
                      onPress={open}
                      className="h-9 w-9 items-center justify-center rounded-md border border-neutral-300"
                    >
                      <Text>✏️</Text>
                    </Pressable>
                  )}
                />
                <Pressable
                  onPress={() => confirmDelete(row.id)}
                  disabled={deletingId === row.id}
                  className="h-9 w-9 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-60"
                >
                  <Text>🗑️</Text>
                </Pressable>
              </View>
            </View>
            {row.working_on ? (
              <Text className="font-sans text-sm text-neutral-900">
                Working on: {row.working_on}
              </Text>
            ) : null}
            {row.struggling_with ? (
              <Text className="font-sans text-sm text-neutral-900">
                Struggling with: {row.struggling_with}
              </Text>
            ) : null}
            {row.notes ? (
              <Text className="font-sans text-sm text-neutral-600">{row.notes}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}
