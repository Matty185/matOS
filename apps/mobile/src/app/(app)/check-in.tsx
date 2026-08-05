import { useEffect, useState } from "react";
import { Text, View, ScrollView, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { apiPost, type ApiErrorBody } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";
import { GymTeaser } from "@/components/gym-teaser";
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

const CHECK_IN_OPENS_MINUTES_BEFORE = 30;

function formatTime(time: string) {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = parts[1] ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
}

// Mirrors the server-side window check in /api/attendance/check-in — this
// copy only decides which state to *show*; the server independently
// re-validates the window and is the actual enforcement (CLAUDE.md: RLS/
// server checks are the boundary, client checks are UX convenience only).
function getWindowState(classRow: ClassRow, now: Date): "too_early" | "open" | "too_late" {
  const timeParts = classRow.start_time.split(":").map(Number);
  const hours = timeParts[0] ?? 0;
  const minutes = timeParts[1] ?? 0;
  const classStart = new Date(now);
  classStart.setHours(hours, minutes, 0, 0);
  const windowOpen = new Date(classStart.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60 * 1000);
  const windowClose = new Date(classStart.getTime() + classRow.duration_minutes * 60 * 1000);
  if (now < windowOpen) return "too_early";
  if (now > windowClose) return "too_late";
  return "open";
}

// Mirrors apps/web's (athlete)/check-in/page.tsx exactly: same query shape,
// same window logic, same 30s re-evaluation tick. The actual check-in
// write goes through POST /api/attendance/check-in (via apiPost, which
// attaches the caller's Supabase access token as a Bearer header — see
// Stage M1's Decision Log) rather than a direct Supabase insert, since
// that route does server-side window validation and writes the audit_log
// row neither RLS nor a raw insert would give us. Solo users have no
// classes to check into at all — the gym teaser replaces the whole screen.
export default function CheckInScreen() {
  const { data: member, isPending: isMemberPending } = useCurrentMember();
  const isSolo = member?.gymKind === "personal";
  const [now, setNow] = useState(() => new Date());
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const today = todayIsoDate();
  const dayOfWeek = new Date(`${today}T00:00:00`).getDay();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["check-in", "today", dayOfWeek, member?.memberId],
    queryFn: async () => {
      if (!member) throw new Error("No member record");

      const [classesRes, attendanceRes] = await Promise.all([
        supabase
          .from("classes")
          .select("*")
          .eq("day_of_week", dayOfWeek)
          .eq("active", true)
          .order("start_time", { ascending: true }),
        supabase
          .from("attendance")
          .select("class_id")
          .eq("member_id", member.memberId)
          .eq("checked_in_date", today),
      ]);
      if (classesRes.error) throw classesRes.error;
      if (attendanceRes.error) throw attendanceRes.error;

      return {
        classes: classesRes.data,
        checkedInClassIds: new Set(attendanceRes.data.map((a) => a.class_id)),
      };
    },
    enabled: !!member && !isSolo,
  });

  async function handleCheckIn(classId: string) {
    setCheckingInId(classId);
    setCheckInError(null);
    const result = await apiPost("/api/attendance/check-in", { class_id: classId });
    if (!result.ok) {
      setCheckInError((result.error as ApiErrorBody).error ?? "Couldn't check in.");
    } else {
      queryClient.invalidateQueries({ queryKey: ["check-in"] });
    }
    setCheckingInId(null);
  }

  // Gated on the member lookup's own pending state — see Home screen's
  // identical comment (Stage M1 code-review finding): a disabled query has
  // isPending: true but isLoading: false, so isSolo would otherwise default
  // to false and briefly show the gym-member class list to solo users too.
  if (isMemberPending) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white" edges={["top"]}>
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  if (isSolo) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={["top"]}>
        <View className="gap-6 p-4">
          <Text className="font-heading text-3xl tracking-wide text-primary">Check In</Text>
          <GymTeaser />
        </View>
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
        <Text className="font-heading text-3xl tracking-wide text-primary">Check In</Text>

        {checkInError ? (
          <Text className="font-sans text-sm text-red-600">{checkInError}</Text>
        ) : null}

        {isLoading ? (
          <Text className="font-sans text-sm text-neutral-600">
            Loading today&apos;s classes...
          </Text>
        ) : error ? (
          <Text className="font-sans text-sm text-red-600">
            Couldn&apos;t load today&apos;s classes. Pull to refresh.
          </Text>
        ) : !data || data.classes.length === 0 ? (
          <View className="items-center gap-1 rounded-md border border-neutral-200 p-6">
            <Text className="font-sans-bold text-sm text-neutral-900">No classes today</Text>
            <Text className="text-center font-sans text-sm text-neutral-600">
              Check back on a day your gym has classes scheduled.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {data.classes.map((c) => {
              const alreadyCheckedIn = data.checkedInClassIds.has(c.id);
              const windowState = getWindowState(c, now);

              return (
                <View
                  key={c.id}
                  className="flex-row items-center justify-between gap-3 rounded-md border border-neutral-200 p-4"
                >
                  <View className="flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="font-sans-bold text-sm text-neutral-900">{c.name}</Text>
                      <View className="rounded-full border border-neutral-300 px-2 py-0.5">
                        <Text className="font-sans text-xs text-neutral-600">
                          {CLASS_TYPE_LABELS[c.class_type]}
                        </Text>
                      </View>
                    </View>
                    <Text className="font-sans text-sm text-neutral-600">
                      {formatTime(c.start_time)} · {c.duration_minutes} min
                    </Text>
                  </View>

                  {alreadyCheckedIn ? (
                    <View className="h-11 items-center justify-center rounded-md bg-primary px-3">
                      <Text className="font-sans-bold text-sm text-white">✓ Checked in</Text>
                    </View>
                  ) : windowState === "too_early" ? (
                    <Text className="max-w-32 text-right font-sans text-xs text-neutral-600">
                      Opens 30 min before class
                    </Text>
                  ) : windowState === "too_late" ? (
                    <Text className="max-w-32 text-right font-sans text-xs text-neutral-600">
                      Check-in closed
                    </Text>
                  ) : (
                    <Pressable
                      onPress={() => handleCheckIn(c.id)}
                      disabled={checkingInId === c.id}
                      className="h-11 items-center justify-center rounded-md bg-primary px-4 disabled:opacity-60"
                    >
                      <Text className="font-sans-bold text-sm text-white">
                        {checkingInId === c.id ? "Checking in..." : "Check In"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
