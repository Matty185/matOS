import { CLASS_PROGRAM_LABELS, type ClassProgram } from "@matos/shared";

// Flow audit 3.3: helpers for the assistant's class write proposals
// (create_class, update_class). Server-side only, used by /api/agent while
// building the confirmation card.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClassRow = {
  id: string;
  name: string;
  class_type: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  max_capacity: number | null;
  active: boolean;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TYPE_LABELS: Record<string, string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open mat",
};

const hhmm = (t: string) => t.slice(0, 5);
// Model-supplied text on the confirmation card is capped.
const clip = (v: unknown) => {
  const t = String(v);
  return t.length > 100 ? `${t.slice(0, 99)}…` : t;
};
const has = (o: Record<string, unknown>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

/**
 * The model sends only what changes; PATCH /api/classes/[id] takes the full
 * record. Everything not mentioned keeps its current value. Coach and
 * programme are passed on only when mentioned, so the route leaves them
 * alone otherwise. The PATCH route's Zod schema still validates the result.
 */
export function mergeClassUpdate(
  current: ClassRow,
  changes: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    class_id: current.id,
    name: has(changes, "name") ? changes.name : current.name,
    class_type: has(changes, "class_type") ? changes.class_type : current.class_type,
    day_of_week: has(changes, "day_of_week") ? changes.day_of_week : current.day_of_week,
    start_time: has(changes, "start_time") ? changes.start_time : hhmm(current.start_time),
    duration_minutes: has(changes, "duration_minutes")
      ? changes.duration_minutes
      : current.duration_minutes,
    max_capacity: has(changes, "max_capacity") ? changes.max_capacity : current.max_capacity,
    active: typeof changes.active === "boolean" ? changes.active : current.active,
  };
  if (has(changes, "program")) merged.program = changes.program;
  if (has(changes, "coach_member_id")) merged.coach_member_id = changes.coach_member_id;
  return merged;
}

/** False when the model named no field at all (only class_id). */
export function classUpdateChangesAnything(
  current: ClassRow,
  changes: Record<string, unknown>,
): boolean {
  const keys = [
    "name",
    "class_type",
    "day_of_week",
    "start_time",
    "duration_minutes",
    "max_capacity",
    "program",
    "coach_member_id",
  ];
  return (
    keys.some((k) => has(changes, k)) ||
    (typeof changes.active === "boolean" && changes.active !== current.active)
  );
}

function coachText(id: unknown, names: Map<string, string>): string {
  if (id === null) return "no coach";
  if (typeof id !== "string") return "unknown";
  return names.get(id) ?? "unknown member";
}

function programText(p: unknown): string {
  return typeof p === "string" && p in CLASS_PROGRAM_LABELS
    ? CLASS_PROGRAM_LABELS[p as ClassProgram]
    : clip(p);
}

/** "Kids BJJ (Tue 18:00): coach → Sam Coach, programme → Kids". */
export function describeClassUpdate(
  current: ClassRow,
  changes: Record<string, unknown>,
  coachNames: Map<string, string>,
): string {
  const parts: string[] = [];
  if (has(changes, "coach_member_id")) {
    parts.push(
      changes.coach_member_id === null
        ? "remove coach"
        : `coach → ${coachText(changes.coach_member_id, coachNames)}`,
    );
  }
  if (has(changes, "program")) parts.push(`programme → ${programText(changes.program)}`);
  if (has(changes, "name")) parts.push(`name → ${clip(changes.name)}`);
  if (has(changes, "class_type"))
    parts.push(`type → ${TYPE_LABELS[String(changes.class_type)] ?? String(changes.class_type)}`);
  if (has(changes, "day_of_week"))
    parts.push(`day → ${DAYS[Number(changes.day_of_week)] ?? String(changes.day_of_week)}`);
  if (has(changes, "start_time")) parts.push(`time → ${clip(changes.start_time)}`);
  if (has(changes, "duration_minutes"))
    parts.push(`length → ${String(changes.duration_minutes)} min`);
  if (has(changes, "max_capacity"))
    parts.push(
      changes.max_capacity === null
        ? "no capacity limit"
        : `capacity → ${String(changes.max_capacity)}`,
    );
  if (typeof changes.active === "boolean" && changes.active !== current.active)
    parts.push(changes.active ? "reactivate" : "deactivate");
  const which = `${current.name} (${DAYS[current.day_of_week] ?? "?"} ${hhmm(current.start_time)})`;
  return `${which}: ${parts.length > 0 ? parts.join(", ") : "no changes"}`;
}

/** "Kids BJJ, Tue 18:00 · Kids · coach Sam Coach". */
export function describeClassCreate(
  input: Record<string, unknown>,
  coachNames: Map<string, string>,
): string {
  const parts = [
    `${clip(input.name)}, ${DAYS[Number(input.day_of_week)] ?? "?"} ${clip(input.start_time)}`,
  ];
  if (typeof input.program === "string") parts.push(programText(input.program));
  if (typeof input.coach_member_id === "string")
    parts.push(`coach ${coachText(input.coach_member_id, coachNames)}`);
  return parts.join(" · ");
}
