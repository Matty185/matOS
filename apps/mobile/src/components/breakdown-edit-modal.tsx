import { useEffect, useState } from "react";
import { Modal, Text, TextInput, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBreakdownSchema } from "@matos/shared";
import { apiPatch, type ApiErrorBody } from "@/lib/api";

type FormValues = {
  name: string;
  match_date: string;
  gi: boolean;
  result?: "win" | "loss" | "draw";
  method?: "submission" | "points" | "decision" | "dq";
  visibility: "private" | "gym";
};

const RESULT_OPTIONS = ["win", "loss", "draw"] as const;
const METHOD_OPTIONS = ["submission", "points", "decision", "dq"] as const;

// RN Modal port of apps/web's BreakdownEditDialog — same fields, same
// PATCH /api/breakdowns/[id] contract. Never touches focus (member_id/
// external_person_id) — breakdowns are standalone once created (Non-
// Negotiable #5).
export function BreakdownEditModal({
  breakdownId,
  defaultValues,
  onSaved,
  trigger,
}: {
  breakdownId: string;
  defaultValues: FormValues;
  onSaved: () => void;
  trigger: (open: () => void) => React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(updateBreakdownSchema) as never,
    defaultValues,
  });

  // useForm only applies `defaultValues` on this hook instance's first
  // render — a later prop change (e.g. the parent's breakdown query
  // refetching with fresher data while this modal is already mounted) is
  // silently ignored without this, letting Save overwrite fields the user
  // never touched back to a stale snapshot. Mirrors apps/web's identical
  // effect in BreakdownEditDialog — missing here was a real, reproducible
  // regression caught in Stage M2's code-review gate, not just a
  // theoretical gap.
  useEffect(() => {
    reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    defaultValues.name,
    defaultValues.match_date,
    defaultValues.gi,
    defaultValues.result,
    defaultValues.method,
    defaultValues.visibility,
  ]);

  async function onSubmit(data: FormValues) {
    setSubmitError(null);
    const result = await apiPatch(`/api/breakdowns/${breakdownId}`, data);
    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }
    setVisible(false);
    onSaved();
  }

  return (
    <>
      {trigger(() => setVisible(true))}
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView contentContainerClassName="gap-4 p-4">
            <Text className="font-heading text-2xl tracking-wide text-primary">Edit breakdown</Text>

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
              <Controller
                control={control}
                name="visibility"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row gap-2">
                    <ChoicePill
                      label="Private"
                      selected={value === "private"}
                      onPress={() => onChange("private")}
                    />
                    <ChoicePill
                      label="Shared with gym"
                      selected={value === "gym"}
                      onPress={() => onChange("gym")}
                    />
                  </View>
                )}
              />
            </View>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Result</Text>
              <Controller
                control={control}
                name="result"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row gap-2">
                    {RESULT_OPTIONS.map((r) => (
                      <ChoicePill
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

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Method</Text>
              <Controller
                control={control}
                name="method"
                render={({ field: { onChange, value } }) => (
                  <View className="flex-row flex-wrap gap-2">
                    {METHOD_OPTIONS.map((m) => (
                      <ChoicePill
                        key={m}
                        label={m === "dq" ? "DQ" : m[0]!.toUpperCase() + m.slice(1)}
                        selected={value === m}
                        onPress={() => onChange(value === m ? undefined : m)}
                      />
                    ))}
                  </View>
                )}
              />
            </View>

            {submitError ? (
              <Text className="font-sans text-sm text-red-600">{submitError}</Text>
            ) : null}

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setVisible(false)}
                className="h-11 flex-1 items-center justify-center rounded-md border border-neutral-300"
              >
                <Text className="font-sans-bold text-sm text-neutral-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit(onSubmit)}
                disabled={isSubmitting}
                className="h-11 flex-1 items-center justify-center rounded-md bg-primary disabled:opacity-60"
              >
                <Text className="font-sans-bold text-sm text-white">
                  {isSubmitting ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-md px-4 ${
        selected ? "bg-primary" : "border border-neutral-300"
      }`}
    >
      <Text className={`font-sans-bold text-sm ${selected ? "text-white" : "text-neutral-900"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
