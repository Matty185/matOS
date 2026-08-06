import { Text, View, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { computeAttendanceStreak, computeUpcomingClasses, type Database } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { useCurrentMember } from "@/lib/use-current-member";
import { BeltDisplay } from "@/components/belt-display";
import { GymTeaser } from "@/components/gym-teaser";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

function formatTime(time: string) {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = parts[1] ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

// Mirrors apps/web's (athlete)/home/page.tsx: belt, attendance streak,
// upcoming classes (via the same shared computeAttendanceStreak/
// computeUpcomingClasses functions web uses — Stage M1 extraction, so
// neither platform can drift on the number). Solo users (gym_kind ===
// "personal") have no classes/attendance to show at all — the gym teaser
// takes the classes section's place rather than rendering an empty
// "0 week streak" that would read as broken.
export default function HomeScreen() {
  const { data: member, isPending: isMemberPending } = useCurrentMember();
  const isSolo = member?.gymKind === "personal";

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["home-summary", member?.memberId],
    queryFn: async () => {
      if (!member) return null;
      const [{ data: memberRow }, { data: attendanceRows }, { data: classRows }] =
        await Promise.all([
          supabase.from("members").select("belt, stripes").eq("id", member.memberId).single(),
          isSolo
            ? Promise.resolve({ data: [] })
            : supabase
                .from("attendance")
                .select("checked_in_date")
                .eq("member_id", member.memberId),
          isSolo
            ? Promise.resolve({ data: [] })
            : supabase.from("classes").select("*").eq("active", true),
        ]);

      return {
        belt: memberRow?.belt ?? null,
        stripes: memberRow?.stripes ?? 0,
        streak: computeAttendanceStreak((attendanceRows ?? []).map((a) => a.checked_in_date)),
        upcoming: computeUpcomingClasses(classRows ?? []),
      };
    },
    enabled: !!member,
  });

  // Gated on the member lookup's own pending state, not just `!member` —
  // a disabled/not-yet-started query has isPending: true but isLoading:
  // false (isLoading is isPending && isFetching in TanStack Query v5), so
  // relying on the home-summary query's isLoading alone let isSolo default
  // to false and briefly render the gym-member empty state to solo users
  // too, on every cold start (caught in Stage M1's code-review gate).
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
        contentContainerClassName="gap-6 p-4"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View className="gap-3">
          <Text className="font-heading text-3xl tracking-wide text-primary">
            Welcome, {member?.firstName ?? "..."}
          </Text>
          {data?.belt ? (
            <BeltDisplay belt={data.belt} stripes={data.stripes} size="lg" showLabel />
          ) : null}
        </View>

        {isSolo ? (
          <GymTeaser />
        ) : (
          <>
            {isLoading ? (
              <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
            ) : (
              <View className="flex-row items-center gap-3 rounded-md border border-neutral-200 p-4">
                <Text className="text-2xl">🔥</Text>
                <View>
                  <Text className="font-sans-bold text-2xl text-neutral-900">
                    {data?.streak ?? 0} {data?.streak === 1 ? "week" : "weeks"}
                  </Text>
                  <Text className="font-sans text-sm text-neutral-600">
                    Current attendance streak
                  </Text>
                </View>
              </View>
            )}

            <View className="gap-2">
              <Text className="font-sans-bold text-lg text-neutral-900">Upcoming classes</Text>
              {isLoading ? (
                <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
              ) : !data?.upcoming.length ? (
                <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
                  <Text className="font-sans-bold text-sm text-neutral-900">
                    No classes scheduled
                  </Text>
                  <Text className="text-center font-sans text-sm text-neutral-600">
                    Your gym&apos;s schedule will show up here once it&apos;s set up.
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {data.upcoming.map(({ date, classRow }, i) => (
                    <View
                      key={`${classRow.id}-${i}`}
                      className="flex-row items-center justify-between gap-3 rounded-md border border-neutral-200 p-3"
                    >
                      <View className="gap-0.5">
                        <Text className="font-sans-bold text-sm text-neutral-900">
                          {classRow.name}
                        </Text>
                        <Text className="font-sans text-sm text-neutral-600">
                          {format(date, "EEEE")} · {formatTime(classRow.start_time)} ·{" "}
                          {CLASS_TYPE_LABELS[classRow.class_type]}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
