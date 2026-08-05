import { useState } from "react";
import { Modal, Text, TextInput, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createExternalPersonSchema, type CreateExternalPersonInput } from "@matos/shared";
import { apiPost, apiPatch, type ApiErrorBody } from "@/lib/api";

type ExternalPersonFormModalProps =
  | { mode: "create"; onSaved: () => void; trigger: (open: () => void) => React.ReactNode }
  | {
      mode: "edit";
      personId: string;
      defaultValues: { display_name: string; notes: string };
      onSaved: () => void;
      trigger: (open: () => void) => React.ReactNode;
    };

// RN Modal port of apps/web's ExternalPersonFormDialog — same schema, same
// create-vs-edit API contract.
export function ExternalPersonFormModal(props: ExternalPersonFormModalProps) {
  const isEdit = props.mode === "edit";
  const [visible, setVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateExternalPersonInput>({
    resolver: zodResolver(createExternalPersonSchema),
    defaultValues: isEdit
      ? { display_name: props.defaultValues.display_name, notes: props.defaultValues.notes }
      : { display_name: "", notes: "" },
  });

  async function onSubmit(data: CreateExternalPersonInput) {
    setSubmitError(null);
    // The schema accepts undefined or null for notes, not "" — an empty
    // textarea has to be converted before sending, matching the exact bug
    // class this schema's own comment documents (web's dialog does the
    // same `data.notes || null` conversion).
    const payload = { ...data, notes: data.notes || null };
    const result = isEdit
      ? await apiPatch(`/api/external-people/${props.personId}`, payload)
      : await apiPost("/api/external-people", payload);

    if (!result.ok) {
      setSubmitError((result.error as ApiErrorBody).error ?? "Something went wrong.");
      return;
    }

    setVisible(false);
    if (!isEdit) reset({ display_name: "", notes: "" });
    props.onSaved();
  }

  return (
    <>
      {props.trigger(() => setVisible(true))}
      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <SafeAreaView className="flex-1 bg-white">
          <ScrollView contentContainerClassName="gap-4 p-4">
            <Text className="font-heading text-2xl tracking-wide text-primary">
              {isEdit ? "Edit person" : "New external person"}
            </Text>

            <View className="gap-1.5">
              <Text className="font-sans-bold text-sm text-neutral-900">Name</Text>
              <Controller
                control={control}
                name="display_name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                )}
              />
              {errors.display_name ? (
                <Text className="font-sans text-sm text-red-600">
                  {errors.display_name.message}
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
