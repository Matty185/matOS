import { useState } from "react";
import { Text, View, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PositionRef, EventTypeRef } from "@matos/shared";
import { CATEGORY_LABELS } from "./category-rail";

type OverlayScreen =
  | { screen: "event-grid"; category: string }
  | { screen: "position-grid" }
  | { screen: "modifier-outcome-sheet"; eventType: EventTypeRef }
  | { screen: "role-picker"; position: PositionRef };

// Mode 2 — the paused-video overlay. Timestamp is already frozen by the
// caller at the moment of the rail tap (matos_tagging_ux_plan.md's golden
// rule: "captured at first tap, not at confirm") — this component only
// ever reads it, never the live video clock. Category taps land directly
// on the event grid for that category (the rail already chose the
// category); Position lands on the position grid. A position with no
// `roles` tags immediately on tap — no confirm sheet at all, matching
// web's exact behavior (a role-less position is a one-tap tag).
export function TaggingOverlay({
  ts,
  initial,
  positions,
  eventsByCategory,
  onConfirmEvent,
  onConfirmPosition,
  onCancel,
}: {
  ts: number;
  initial: { type: "category"; category: string } | { type: "position" };
  positions: PositionRef[];
  eventsByCategory: Map<string, EventTypeRef[]>;
  onConfirmEvent: (
    eventType: EventTypeRef,
    modifier: string | null,
    outcome: string | null,
  ) => void;
  onConfirmPosition: (position: PositionRef, role: string | null) => void;
  onCancel: () => void;
}) {
  const [state, setState] = useState<OverlayScreen>(
    initial.type === "category"
      ? { screen: "event-grid", category: initial.category }
      : { screen: "position-grid" },
  );
  const [modifier, setModifier] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  function selectEventType(eventType: EventTypeRef) {
    setModifier(null);
    setOutcome(null);
    setValidationError(null);
    setState({ screen: "modifier-outcome-sheet", eventType });
  }

  function selectPosition(position: PositionRef) {
    if (!position.roles || position.roles.length === 0) {
      onConfirmPosition(position, null);
      return;
    }
    setState({ screen: "role-picker", position });
  }

  function confirmEvent() {
    if (state.screen !== "modifier-outcome-sheet") return;
    const { eventType } = state;
    // Client-side mirror of the validate_breakdown_event DB trigger — this
    // only avoids a wasted round-trip; the trigger is the real boundary.
    if (eventType.modifier_required && !modifier) {
      setValidationError("Pick a modifier to continue.");
      return;
    }
    if (eventType.outcome_required && !outcome) {
      setValidationError("Pick an outcome to continue.");
      return;
    }
    onConfirmEvent(eventType, modifier, outcome);
  }

  return (
    <View className="absolute inset-0 items-stretch justify-end bg-black/85">
      <SafeAreaView edges={["bottom"]} className="max-h-[85%]">
        <View className="flex-row items-center justify-between px-4 py-3">
          <Text className="font-sans-bold text-sm text-white">
            {ts.toFixed(1)}s
            {state.screen === "event-grid" ? ` · ${CATEGORY_LABELS[state.category]}` : ""}
            {state.screen === "position-grid" ? " · Position" : ""}
            {state.screen === "modifier-outcome-sheet" ? ` · ${state.eventType.name}` : ""}
            {state.screen === "role-picker" ? ` · ${state.position.name}` : ""}
          </Text>
          <Pressable onPress={onCancel} className="h-11 items-center justify-center px-2">
            <Text className="font-sans-bold text-sm text-white">Cancel</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerClassName="gap-2 px-4 pb-6">
          {state.screen === "event-grid" ? (
            (eventsByCategory.get(state.category) ?? []).map((eventType) => (
              <GridButton
                key={eventType.id}
                label={eventType.name}
                onPress={() => selectEventType(eventType)}
              />
            ))
          ) : state.screen === "position-grid" ? (
            positions.map((position) => (
              <GridButton
                key={position.id}
                label={position.name}
                onPress={() => selectPosition(position)}
              />
            ))
          ) : state.screen === "role-picker" ? (
            state.position.roles!.map((role) => (
              <GridButton
                key={role}
                label={role}
                onPress={() => onConfirmPosition(state.position, role)}
              />
            ))
          ) : (
            <View className="gap-4">
              {state.eventType.modifier_options ? (
                <View className="gap-1.5">
                  <Text className="font-sans-bold text-sm text-white">
                    Modifier {state.eventType.modifier_required ? "(required)" : "(optional)"}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {state.eventType.modifier_options.map((m) => (
                      <ChoicePill
                        key={m}
                        label={m}
                        selected={modifier === m}
                        onPress={() => setModifier(m)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {state.eventType.outcome_options ? (
                <View className="gap-1.5">
                  <Text className="font-sans-bold text-sm text-white">
                    Outcome {state.eventType.outcome_required ? "(required)" : "(optional)"}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {state.eventType.outcome_options.map((o) => (
                      <ChoicePill
                        key={o}
                        label={o}
                        selected={outcome === o}
                        onPress={() => setOutcome(o)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {!state.eventType.modifier_options && !state.eventType.outcome_options ? (
                <Text className="font-sans text-sm text-neutral-300">
                  No details needed — just confirm.
                </Text>
              ) : null}

              {validationError ? (
                <Text className="font-sans text-sm text-red-400">{validationError}</Text>
              ) : null}

              <Pressable
                onPress={confirmEvent}
                className="h-11 items-center justify-center rounded-md bg-primary"
              >
                <Text className="font-sans-bold text-sm text-white">Confirm</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function GridButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-11 items-center justify-center rounded-md border border-white/30 px-4"
    >
      <Text className="font-sans-bold text-sm text-white">{label}</Text>
    </Pressable>
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
        selected ? "bg-primary" : "border border-white/30"
      }`}
    >
      <Text className="font-sans-bold text-sm text-white">{label}</Text>
    </Pressable>
  );
}
