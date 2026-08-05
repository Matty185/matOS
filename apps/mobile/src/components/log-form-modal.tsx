import { useState } from "react";
import { Modal, Text, TextInput, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { athleteLogSchema, type AthleteLogInput } from "@matos/shared";
import { apiPost, apiPatch, type ApiErrorBody } from "@/lib/api";

type LogRow = {
  id: string;
  entry_date: string;
  working_on: string | null;
  struggling_with: string | null;
  notes: string | null;
  visible_to_coach: boolean;
};

type LogFormModalProps =
  | { mode: "create"; onSaved: () => void; trigger: (open: () => void) => React.ReactNode }
  | {
      mode: "edit";
      log: LogRow;
      onSaved: () => void;
      trigger: (open: () => void) => React.ReactNode;
    };

// RN Modal port of apps/web's LogFormDialog (progress-client.tsx) — same
// schema, same create-vs-edit API contract (POST /api/logs, PATCH
// /api/logs/[id], both via apiPost/apiPatch rather than a direct Supabase
// write, so the audit_log trail stays complete on mobile too — see Stage
// M1's Decision Log). `trigger` is a render-prop so the caller controls
// what opens the modal (an "Add" button vs. a small edit icon).
export function LogFormModal(props: LogFormModalProps) {
  const isEdit = props.mode === "edit";
  const [visible, setVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AthleteLogInput>({
    resolver: zodResolver(athleteLogSchema),
    defaultValues: isEdit
      ? {
          entry_date: props.log.entry_date,
          working_on: props.log.working_on ?? "",
          struggling_with: props.log.struggling_with ?? "",
          notes: props.log.notes ?? "",
          visible_to_coach: props.log.visible_to_coach,
        }
      : {
          entry_date: new Date().toISOString().slice(0, 10),
          visible_to_coach: true,
        },
  });

  async function onSubmit(data: AthleteLogInput) {
    setSubmitError(null);
    const result = isEdit
      ? await apiPatch(`/api/logs/${props.log.id}`, data)
      : await apiPost("/api/logs", data);

    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }

    setVisible(false);
    if (!isEdit)
      reset({ entry_date: new Date().toISOString().slice(0, 10), visible_to_coach: true });
    props.onSaved();
  }

  return (
    <>
      {props.trigger(() => setVisible(true))}
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView contentContainerClassName="gap-4 p-4">
            <Text className="font-heading text-2xl tracking-wide text-primary">
              {isEdit ? "Edit entry" : "New log entry"}
            </Text>
            <Text className="font-sans text-sm text-neutral-600">
              Track what you&apos;re working on after a session.
            </Text>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Date</Text>
              <Controller
                control={control}
                name="entry_date"
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
              {errors.entry_date ? (
                <Text className="font-sans text-sm text-red-600">{errors.entry_date.message}</Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Working on</Text>
              <Controller
                control={control}
                name="working_on"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value ?? ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                )}
              />
              {errors.working_on ? (
                <Text className="font-sans text-sm text-red-600">{errors.working_on.message}</Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Struggling with</Text>
              <Controller
                control={control}
                name="struggling_with"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value ?? ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                )}
              />
              {errors.struggling_with ? (
                <Text className="font-sans text-sm text-red-600">
                  {errors.struggling_with.message}
                </Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Notes</Text>
              <Controller
                control={control}
                name="notes"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value ?? ""}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                    numberOfLines={4}
                    className="min-h-24 rounded-md border border-neutral-300 px-3 py-2 font-sans text-base"
                  />
                )}
              />
              {errors.notes ? (
                <Text className="font-sans text-sm text-red-600">{errors.notes.message}</Text>
              ) : null}
            </View>

            <Controller
              control={control}
              name="visible_to_coach"
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
                  <Text className="font-sans text-sm text-neutral-900">Visible to my coach</Text>
                </Pressable>
              )}
            />

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
