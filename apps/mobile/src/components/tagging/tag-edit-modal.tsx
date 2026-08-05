import { useState } from "react";
import { Alert, Modal, Text, TextInput, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { humanize } from "@matos/shared";
import type { DraftPosition, DraftEvent } from "@/lib/tagging-draft";

type TagEditModalProps =
  | {
      kind: "position";
      row: DraftPosition;
      positionLabel: string;
      roleOptions: string[] | null;
      onSave: (patch: { role: string | null; start_ts: number; end_ts: number | null }) => void;
      onDelete: () => void;
      onClose: () => void;
    }
  | {
      kind: "event";
      row: DraftEvent;
      eventLabel: string;
      modifierOptions: string[] | null;
      outcomeOptions: string[] | null;
      onSave: (patch: { modifier: string | null; outcome: string | null; ts: number }) => void;
      onDelete: () => void;
      onClose: () => void;
    };

// RN port of apps/web's TagEditDialog. Writes to the local draft (via the
// onSave/onDelete callbacks the caller wires to tagging-draft.ts), not a
// direct PATCH/DELETE — the sync engine pushes it to the server later,
// matching Stage M3's local-first model.
export function TagEditModal(props: TagEditModalProps) {
  const isPosition = props.kind === "position";
  const [role, setRole] = useState(isPosition ? (props.row.role ?? "") : "");
  const [modifier, setModifier] = useState(!isPosition ? (props.row.modifier ?? "") : "");
  const [outcome, setOutcome] = useState(!isPosition ? (props.row.outcome ?? "") : "");
  const [startTs, setStartTs] = useState(isPosition ? String(props.row.start_ts) : "");
  const [endTs, setEndTs] = useState(
    isPosition && props.row.end_ts !== null ? String(props.row.end_ts) : "",
  );
  const [ts, setTs] = useState(!isPosition ? String(props.row.ts) : "");

  function handleSave() {
    if (isPosition) {
      const parsedStart = Number(startTs);
      if (Number.isNaN(parsedStart)) return;
      props.onSave({
        role: role || null,
        start_ts: parsedStart,
        end_ts: endTs === "" ? null : Number(endTs),
      });
    } else {
      const parsedTs = Number(ts);
      if (Number.isNaN(parsedTs)) return;
      props.onSave({ modifier: modifier || null, outcome: outcome || null, ts: parsedTs });
    }
    props.onClose();
  }

  function confirmDelete() {
    Alert.alert("Delete this tag?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          props.onDelete();
          props.onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView className="flex-1 bg-white">
        <ScrollView contentContainerClassName="gap-4 p-4">
          <Text className="font-heading text-2xl tracking-wide text-primary">
            {isPosition ? props.positionLabel : props.eventLabel}
          </Text>
          <Text className="font-sans text-sm text-neutral-600">Adjust or remove this tag.</Text>

          {isPosition ? (
            <>
              {props.roleOptions && props.roleOptions.length > 0 ? (
                <View className="gap-1.5">
                  <Text className="font-sans-bold text-sm text-neutral-900">Role</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {props.roleOptions.map((r) => (
                      <ChoicePill
                        key={r}
                        label={humanize(r)}
                        selected={role === r}
                        onPress={() => setRole(r)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1.5">
                  <Text className="font-sans-bold text-sm text-neutral-900">Start (seconds)</Text>
                  <TextInput
                    value={startTs}
                    onChangeText={setStartTs}
                    keyboardType="numeric"
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                </View>
                <View className="flex-1 gap-1.5">
                  <Text className="font-sans-bold text-sm text-neutral-900">
                    End (blank = open)
                  </Text>
                  <TextInput
                    value={endTs}
                    onChangeText={setEndTs}
                    keyboardType="numeric"
                    className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {props.modifierOptions && props.modifierOptions.length > 0 ? (
                <View className="gap-1.5">
                  <Text className="font-sans-bold text-sm text-neutral-900">Modifier</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {props.modifierOptions.map((m) => (
                      <ChoicePill
                        key={m}
                        label={humanize(m)}
                        selected={modifier === m}
                        onPress={() => setModifier(m)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              {props.outcomeOptions && props.outcomeOptions.length > 0 ? (
                <View className="gap-1.5">
                  <Text className="font-sans-bold text-sm text-neutral-900">Outcome</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {props.outcomeOptions.map((o) => (
                      <ChoicePill
                        key={o}
                        label={humanize(o)}
                        selected={outcome === o}
                        onPress={() => setOutcome(o)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              <View className="gap-1.5">
                <Text className="font-sans-bold text-sm text-neutral-900">Timestamp (seconds)</Text>
                <TextInput
                  value={ts}
                  onChangeText={setTs}
                  keyboardType="numeric"
                  className="h-11 rounded-md border border-neutral-300 px-3 font-sans text-base"
                />
              </View>
            </>
          )}

          <View className="flex-row justify-between gap-3">
            <Pressable
              onPress={confirmDelete}
              className="h-11 items-center justify-center rounded-md bg-red-600 px-4"
            >
              <Text className="font-sans-bold text-sm text-white">Delete</Text>
            </Pressable>
            <View className="flex-row gap-3">
              <Pressable
                onPress={props.onClose}
                className="h-11 items-center justify-center rounded-md border border-neutral-300 px-4"
              >
                <Text className="font-sans-bold text-sm text-neutral-900">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className="h-11 items-center justify-center rounded-md bg-primary px-4"
              >
                <Text className="font-sans-bold text-sm text-white">Save</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
