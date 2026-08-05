import { useEffect, useState } from "react";
import { Text, View, TextInput, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { createBreakdownBaseSchema } from "@matos/shared";
import { supabase } from "@/lib/supabase";
import { apiPost, type ApiErrorBody } from "@/lib/api";
import { useCurrentMember } from "@/lib/use-current-member";

type FormValues = {
  name: string;
  match_date: string;
  gi: boolean;
  result?: "win" | "loss" | "draw";
};

const NEW_PERSON_VALUE = "__new__";

// Mirrors apps/web's analysis/new/page.tsx: metadata-only creation — the
// tagging player doesn't exist yet (Stage M3). Submitting creates the
// breakdown row and lands on its detail screen.
export default function NewBreakdownScreen() {
  const router = useRouter();
  const { data: currentMember, isPending: memberPending } = useCurrentMember();
  const isStaff = currentMember?.role === "coach" || currentMember?.role === "gym_owner";

  // currentMember is undefined on first render whenever the query isn't
  // already warm — a useState initializer keyed on isStaff would
  // permanently lock focusMode to "self" even once the role resolves,
  // silently creating breakdowns about the wrong person for a coach
  // (Stage A2 web finding, same bug class as M1's isPending fix — carried
  // forward here deliberately, not rediscovered the hard way).
  const [focusMode, setFocusMode] = useState<"self" | "member" | "external" | null>(null);
  const [focusModeTouched, setFocusModeTouched] = useState(false);

  useEffect(() => {
    if (focusModeTouched || !currentMember) return;
    setFocusMode(isStaff ? "member" : "self");
  }, [currentMember, isStaff, focusModeTouched]);

  function selectFocusMode(mode: "self" | "member" | "external") {
    setFocusModeTouched(true);
    setFocusMode(mode);
  }

  const [memberId, setMemberId] = useState("");
  const [externalPersonId, setExternalPersonId] = useState("");
  const [newPersonName, setNewPersonName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<"private" | "gym" | "">("");
  const [visibilityTouched, setVisibilityTouched] = useState(false);

  useEffect(() => {
    if (visibilityTouched || !currentMember) return;
    setVisibility(currentMember.gymKind === "personal" ? "private" : "gym");
  }, [currentMember, visibilityTouched]);

  const { data: gymMembers } = useQuery({
    queryKey: ["gym-members-active"],
    enabled: focusMode === "member",
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

  const { data: externalPeople } = useQuery({
    queryKey: ["external-people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting: formSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      createBreakdownBaseSchema.omit({ member_id: true, external_person_id: true }),
    ) as never,
    defaultValues: { match_date: format(new Date(), "yyyy-MM-dd"), name: "", gi: true },
  });

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      let resolvedExternalPersonId: string | null = null;

      if (focusMode === "external") {
        if (externalPersonId === NEW_PERSON_VALUE || !externalPersonId) {
          if (!newPersonName.trim()) {
            setSubmitError("Enter a name for the external person.");
            return;
          }
          const result = await apiPost("/api/external-people", {
            display_name: newPersonName.trim(),
          });
          if (!result.ok) {
            setSubmitError((result.error as ApiErrorBody).error ?? "Couldn't create that person.");
            return;
          }
          resolvedExternalPersonId = (result.data as { person: { id: string } }).person.id;
        } else {
          resolvedExternalPersonId = externalPersonId;
        }
      } else if (focusMode === "member" && !memberId) {
        setSubmitError("Pick a member.");
        return;
      }

      const result = await apiPost("/api/breakdowns", {
        member_id:
          focusMode === "self"
            ? currentMember?.memberId
            : focusMode === "member"
              ? memberId
              : undefined,
        external_person_id: focusMode === "external" ? resolvedExternalPersonId : undefined,
        name: data.name,
        match_date: data.match_date,
        gi: data.gi,
        result: data.result || null,
        visibility: visibility || undefined,
      });

      if (!result.ok) {
        setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
        return;
      }

      const breakdown = (result.data as { breakdown: { id: string } }).breakdown;
      router.replace(`/analysis/${breakdown.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (memberPending || !currentMember || focusMode === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-sm text-neutral-600">Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 p-4">
        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Who is this about?</Text>
          <View className="flex-row flex-wrap gap-2">
            {!isStaff ? (
              <Pill
                label="Myself"
                selected={focusMode === "self"}
                onPress={() => selectFocusMode("self")}
              />
            ) : (
              <Pill
                label="A gym member"
                selected={focusMode === "member"}
                onPress={() => selectFocusMode("member")}
              />
            )}
            <Pill
              label="External person"
              selected={focusMode === "external"}
              onPress={() => selectFocusMode("external")}
            />
          </View>
        </View>

        {focusMode === "member" ? (
          <View className="gap-1.5">
            <Text className="font-sans-bold text-sm text-neutral-900">Member</Text>
            <View className="gap-1.5">
              {(gymMembers ?? []).map((m) => (
                <Pill
                  key={m.id}
                  label={`${m.first_name} ${m.last_name}`}
                  selected={memberId === m.id}
                  onPress={() => setMemberId(m.id)}
                  fullWidth
                />
              ))}
            </View>
          </View>
        ) : null}

        {focusMode === "external" ? (
          <View className="gap-1.5">
            <Text className="font-sans-bold text-sm text-neutral-900">External person</Text>
            <View className="gap-1.5">
              <Pill
                label="+ Create new person"
                selected={externalPersonId === NEW_PERSON_VALUE}
                onPress={() => setExternalPersonId(NEW_PERSON_VALUE)}
                fullWidth
              />
              {(externalPeople ?? []).map((p) => (
                <Pill
                  key={p.id}
                  label={p.display_name}
                  selected={externalPersonId === p.id}
                  onPress={() => setExternalPersonId(p.id)}
                  fullWidth
                />
              ))}
            </View>
            {externalPersonId === NEW_PERSON_VALUE ? (
              <TextInput
                value={newPersonName}
                onChangeText={setNewPersonName}
                placeholder="New person's name"
                className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
              />
            ) : null}
          </View>
        ) : null}

        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Title</Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="e.g. Sparring round vs blue belt"
                className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
              />
            )}
          />
          {errors.name ? (
            <Text className="font-sans text-sm text-red-600">{errors.name.message}</Text>
          ) : null}
        </View>

        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Match date</Text>
          <Controller
            control={control}
            name="match_date"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="YYYY-MM-DD"
                className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
              />
            )}
          />
          {errors.match_date ? (
            <Text className="font-sans text-sm text-red-600">{errors.match_date.message}</Text>
          ) : null}
        </View>

        <Controller
          control={control}
          name="gi"
          render={({ field: { onChange, value } }) => (
            <Pressable
              onPress={() => onChange(!value)}
              className="h-11 flex-row items-center gap-2"
            >
              <View
                className={`h-5 w-5 items-center justify-center rounded border ${
                  value ? "border-primary bg-primary" : "border-neutral-300"
                }`}
              >
                {value ? <Text className="text-xs text-white">✓</Text> : null}
              </View>
              <Text className="font-sans text-sm text-neutral-900">Gi</Text>
            </Pressable>
          )}
        />

        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Visibility</Text>
          <View className="flex-row gap-2">
            <Pill
              label="Private (only you)"
              selected={visibility === "private"}
              onPress={() => {
                setVisibilityTouched(true);
                setVisibility("private");
              }}
            />
            <Pill
              label="Shared with gym"
              selected={visibility === "gym"}
              onPress={() => {
                setVisibilityTouched(true);
                setVisibility("gym");
              }}
            />
          </View>
        </View>

        <View className="gap-1.5">
          <Text className="font-sans-bold text-sm text-neutral-900">Result (optional)</Text>
          <Controller
            control={control}
            name="result"
            render={({ field: { onChange, value } }) => (
              <View className="flex-row gap-2">
                {(["win", "loss", "draw"] as const).map((r) => (
                  <Pill
                    key={r}
                    label={r[0]!.toUpperCase() + r.slice(1)}
                    selected={value === r}
                    onPress={() => onChange(value === r ? undefined : r)}
                  />
                ))}
              </View>
            )}
          />
        </View>

        {submitError ? <Text className="font-sans text-sm text-red-600">{submitError}</Text> : null}

        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={formSubmitting || submitting}
          className="h-11 items-center justify-center self-start rounded-md bg-primary px-6 disabled:opacity-60"
        >
          <Text className="font-sans-bold text-sm text-white">
            {formSubmitting || submitting ? "Creating..." : "Create breakdown"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Pill({
  label,
  selected,
  onPress,
  fullWidth,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-md px-4 ${fullWidth ? "w-full" : ""} ${
        selected ? "bg-primary" : "border border-neutral-300"
      }`}
    >
      <Text className={`font-sans-bold text-sm ${selected ? "text-white" : "text-neutral-900"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
