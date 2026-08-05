import { useState } from "react";
import { Text, View, Pressable, ScrollView } from "react-native";
import { formatVideoTimestamp, humanize } from "@matos/shared";
import type { PositionRef, EventTypeRef } from "@matos/shared";
import type { DraftPosition, DraftEvent } from "@/lib/tagging-draft";
import { TagEditModal } from "./tag-edit-modal";

// Demoted/secondary per matos_tagging_ux_plan.md — "no longer part of the
// primary loop." The plan's own wording offers "swipe-up sheet or button"
// as equivalent mobile options; a tap-to-expand toggle is used here rather
// than a drag gesture, matching web's own "collapse/expand" interaction
// exactly rather than inventing a heavier gesture for the same result.
// The timeline bar itself stays read-only overview (matching web:
// "Overview only — use the lists below to edit or delete a tag") — the
// tag lists underneath are the real edit surface.
export function TimelineSheet({
  positions,
  events,
  positionsById,
  eventTypesById,
  duration,
  onUpdatePosition,
  onDeletePosition,
  onUpdateEvent,
  onDeleteEvent,
}: {
  positions: DraftPosition[];
  events: DraftEvent[];
  positionsById: Map<string, PositionRef>;
  eventTypesById: Map<string, EventTypeRef>;
  duration: number;
  onUpdatePosition: (
    localId: string,
    patch: Partial<Pick<DraftPosition, "role" | "start_ts" | "end_ts">>,
  ) => void;
  onDeletePosition: (localId: string) => void;
  onUpdateEvent: (
    localId: string,
    patch: Partial<Pick<DraftEvent, "modifier" | "outcome" | "ts">>,
  ) => void;
  onDeleteEvent: (localId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingPosition, setEditingPosition] = useState<DraftPosition | null>(null);
  const [editingEvent, setEditingEvent] = useState<DraftEvent | null>(null);

  const visiblePositions = positions.filter((p) => p.pendingOp !== "delete");
  const visibleEvents = events.filter((e) => e.pendingOp !== "delete");

  return (
    <View className="bg-white">
      <Pressable
        onPress={() => setExpanded((e) => !e)}
        className="h-11 flex-row items-center justify-center gap-1.5 border-t border-neutral-200"
      >
        <Text className="font-sans-bold text-sm text-neutral-900">
          {expanded ? "▾ Hide tags" : "▴ Show tags"}
        </Text>
        <Text className="font-sans text-xs text-neutral-500">
          ({visiblePositions.length + visibleEvents.length})
        </Text>
      </Pressable>

      {expanded ? (
        <View className="max-h-80">
          {duration > 0 ? (
            <View className="relative mx-4 mt-2 h-6 rounded-sm bg-neutral-100">
              {visiblePositions.map((p) => {
                const left = (p.start_ts / duration) * 100;
                const width = (((p.end_ts ?? duration) - p.start_ts) / duration) * 100;
                return (
                  <View
                    key={p.localId}
                    className="absolute top-0 h-full bg-primary/40"
                    style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                  />
                );
              })}
              {visibleEvents.map((e) => (
                <View
                  key={e.localId}
                  className="absolute top-0 h-full w-0.5 bg-red-600"
                  style={{ left: `${(e.ts / duration) * 100}%` }}
                />
              ))}
            </View>
          ) : null}

          <ScrollView className="mt-2" contentContainerClassName="gap-2 px-4 pb-4">
            <Text className="font-sans-bold text-xs text-neutral-500">POSITIONS</Text>
            {visiblePositions.length === 0 ? (
              <Text className="font-sans text-sm text-neutral-500">None yet.</Text>
            ) : (
              visiblePositions.map((p) => {
                const label = positionsById.get(p.position_id)?.name ?? p.position_id;
                return (
                  <Pressable
                    key={p.localId}
                    onPress={() => setEditingPosition(p)}
                    className="gap-0.5 rounded-md border border-neutral-200 p-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans text-sm text-neutral-900">
                        {humanize(label)}
                        {p.role ? ` (${humanize(p.role)})` : ""}
                        {p.syncStatus === "pending" || p.syncStatus === "error"
                          ? " · unsynced"
                          : ""}
                      </Text>
                      <Text className="font-sans text-xs text-neutral-500">
                        {formatVideoTimestamp(p.start_ts)}
                        {p.end_ts !== null ? `–${formatVideoTimestamp(p.end_ts)}` : "–live"}
                      </Text>
                    </View>
                    {/* syncError was captured on the row all along but
                        never rendered anywhere — a stuck sync was
                        undiagnosable without reading source (Stage M3
                        gate fix, security-reviewer). */}
                    {p.syncStatus === "error" && p.syncError ? (
                      <Text className="font-sans text-xs text-red-600">{p.syncError}</Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}

            <Text className="mt-2 font-sans-bold text-xs text-neutral-500">EVENTS</Text>
            {visibleEvents.length === 0 ? (
              <Text className="font-sans text-sm text-neutral-500">None yet.</Text>
            ) : (
              visibleEvents.map((e) => {
                const label = eventTypesById.get(e.event_type_id)?.name ?? e.event_type_id;
                return (
                  <Pressable
                    key={e.localId}
                    onPress={() => setEditingEvent(e)}
                    className="gap-0.5 rounded-md border border-neutral-200 p-2"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans text-sm text-neutral-900">
                        {humanize(label)}
                        {e.modifier ? ` (${humanize(e.modifier)})` : ""}
                        {e.syncStatus === "pending" || e.syncStatus === "error"
                          ? " · unsynced"
                          : ""}
                      </Text>
                      <Text className="font-sans text-xs text-neutral-500">
                        {formatVideoTimestamp(e.ts)}
                      </Text>
                    </View>
                    {e.syncStatus === "error" && e.syncError ? (
                      <Text className="font-sans text-xs text-red-600">{e.syncError}</Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}

      {editingPosition ? (
        <TagEditModal
          kind="position"
          row={editingPosition}
          positionLabel={humanize(
            positionsById.get(editingPosition.position_id)?.name ?? "Position",
          )}
          roleOptions={positionsById.get(editingPosition.position_id)?.roles ?? null}
          onSave={(patch) => onUpdatePosition(editingPosition.localId, patch)}
          onDelete={() => onDeletePosition(editingPosition.localId)}
          onClose={() => setEditingPosition(null)}
        />
      ) : null}

      {editingEvent ? (
        <TagEditModal
          kind="event"
          row={editingEvent}
          eventLabel={humanize(eventTypesById.get(editingEvent.event_type_id)?.name ?? "Event")}
          modifierOptions={eventTypesById.get(editingEvent.event_type_id)?.modifier_options ?? null}
          outcomeOptions={eventTypesById.get(editingEvent.event_type_id)?.outcome_options ?? null}
          onSave={(patch) => onUpdateEvent(editingEvent.localId, patch)}
          onDelete={() => onDeleteEvent(editingEvent.localId)}
          onClose={() => setEditingEvent(null)}
        />
      ) : null}
    </View>
  );
}
