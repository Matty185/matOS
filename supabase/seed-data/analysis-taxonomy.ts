// Match Analysis Module — event taxonomy v1.
//
// Transcribed exactly from matos_analysis_module_plan.md §3 ("Event
// Taxonomy v1"). Pure data, not code — per CLAUDE.md's Match Analysis
// Module non-negotiable #3: "Taxonomy is data, not code... Coach edits to
// the taxonomy must never require schema or component changes." A .ts
// file (rather than .json) only because it lets ambiguous spots in the
// plan carry an explanatory note inline instead of silently guessing —
// every value here is a plain string/boolean/array literal, nothing
// executable.
//
// This predates Stage A1's schema (no `event_types`/`breakdown_positions`
// tables exist yet). EVENTS maps ~1:1 onto the event_types table A1
// creates (plan §5: id, category, name, modifier_options jsonb,
// outcome_required bool, outcome_options jsonb, active) — at A1, seed
// event_types rows straight from this array. POSITIONS isn't part of the
// event_types table per §5 (positions are their own concept in
// breakdown_positions.position, not events/modifiers/outcomes), but is
// included here per the Stage A0 brief, since it's equally taxonomy data
// a coach review pass should be able to look at and edit in one place.
//
// Match metadata (name, match_date, gi, focus, result, method,
// duration_seconds — plan §3's last subsection) is deliberately NOT
// included here: those are fixed columns on the `breakdowns` table itself
// (Stage A1 schema), not coach-editable taxonomy.

export type TaxonomyPosition = {
  name: string;
  /** null = no role on this position (standing_neutral, scramble). */
  roles: readonly string[] | null;
  notes?: string;
};

export const POSITIONS: readonly TaxonomyPosition[] = [
  { name: "standing_neutral", roles: null },
  { name: "closed_guard", roles: ["playing", "inside"] },
  { name: "half_guard", roles: ["bottom", "top"] },
  { name: "open_guard", roles: ["playing", "passing"] },
  { name: "side_control", roles: ["top", "bottom"] },
  { name: "mount", roles: ["top", "bottom"] },
  { name: "back_control", roles: ["has_back", "back_taken"] },
  { name: "turtle", roles: ["top", "turtled"] },
  { name: "leg_entanglement", roles: ["attacking", "defending"] },
  { name: "scramble", roles: null, notes: "resolution = next tagged position" },
] as const;

export type EventCategory =
  "standing_wrestling" | "guard_bottom" | "top" | "attack_defence" | "misc";

export type EventOutcomeRequirement = "required" | "optional" | "none";

export type TaxonomyEvent = {
  category: EventCategory;
  name: string;
  /** null = event has no modifier at all (not even optional). */
  modifierOptions: readonly string[] | null;
  /** True only where plan §3 explicitly marks "mod REQ" (submission_attempt only). */
  modifierRequired: boolean;
  outcomeRequirement: EventOutcomeRequirement;
  /** null when outcomeRequirement is "none". */
  outcomeOptions: readonly string[] | null;
  notes?: string;
};

// Shared by submission_attempt and submission_defended so the two never
// drift apart. Plan §3 writes submission_attempt's list with a trailing
// "…" (indicative, not exhaustive) and gives submission_defended's
// modifier only as "sub type (opt)" without re-listing — locked here
// (2026-07-23) to one expanded, commonly-recognized set covering the
// plan's originals plus the next tier of frequently-seen submissions,
// rather than left open, per instruction to lock what makes sense now.
// Provisional, same as everything else in this file — coach reviews once
// the module is built.
const SUBMISSION_TYPES = [
  "armbar",
  "triangle",
  "rnc",
  "guillotine",
  "heel_hook",
  "kimura",
  "americana",
  "omoplata",
  "kneebar",
  "ankle_lock",
  "darce",
  "anaconda",
  "ezekiel",
  "gogoplata",
  "other",
] as const;

export const EVENTS: readonly TaxonomyEvent[] = [
  // ── Standing / wrestling ──────────────────────────────────────────────
  {
    category: "standing_wrestling",
    name: "takedown_attempt",
    modifierOptions: ["single", "double", "throw", "trip", "other"],
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["completed", "defended", "scramble"],
  },
  {
    category: "standing_wrestling",
    name: "takedown_defended",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["stuffed", "conceded", "scramble"],
  },
  {
    category: "standing_wrestling",
    name: "guard_pull",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "optional",
    outcomeOptions: ["to_closed", "to_half", "to_open"],
  },
  {
    category: "standing_wrestling",
    name: "underhook_won",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "none",
    outcomeOptions: null,
  },
  {
    category: "standing_wrestling",
    name: "underhook_lost",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "none",
    outcomeOptions: null,
  },

  // ── Guard (bottom) ────────────────────────────────────────────────────
  {
    category: "guard_bottom",
    name: "sweep_attempt",
    modifierOptions: [
      "scissor",
      "pendulum",
      "hip_bump",
      "butterfly",
      "elevator",
      "berimbolo",
      "other",
    ],
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["completed", "defended"],
    notes:
      'Plan §3 lists a "type" modifier (opt) with no enumerated options given in v1. Locked to a common named-sweep set (2026-07-23) rather than left open, per instruction to lock what makes sense now — provisional, for coach review once the module is built, same as every other list here.',
  },
  {
    category: "guard_bottom",
    name: "guard_retention",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["retained", "passed"],
  },
  {
    category: "guard_bottom",
    name: "wrestle_up_attempt",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["completed", "defended"],
  },

  // ── Top ───────────────────────────────────────────────────────────────
  {
    category: "top",
    name: "guard_pass_attempt",
    modifierOptions: ["pressure", "speed", "leg_drag", "other"],
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["completed", "defended"],
  },

  // ── Attack & defence (any position) ──────────────────────────────────
  {
    category: "attack_defence",
    name: "submission_attempt",
    modifierOptions: SUBMISSION_TYPES,
    modifierRequired: true,
    outcomeRequirement: "required",
    outcomeOptions: ["finished", "defended", "lost_position"],
  },
  {
    category: "attack_defence",
    name: "submission_defended",
    modifierOptions: SUBMISSION_TYPES,
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["escaped", "tapped"],
  },
  {
    category: "attack_defence",
    name: "escape",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "required",
    outcomeOptions: ["completed", "failed"],
    notes:
      "Position escaped from is read off the timeline (per plan §3), not tagged as a modifier here.",
  },
  {
    category: "attack_defence",
    name: "reversal",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "none",
    outcomeOptions: null,
  },
  {
    category: "attack_defence",
    name: "back_take",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "none",
    outcomeOptions: null,
  },

  // ── Misc ──────────────────────────────────────────────────────────────
  {
    category: "misc",
    name: "reset_out_of_bounds",
    modifierOptions: null,
    modifierRequired: false,
    outcomeRequirement: "none",
    outcomeOptions: null,
  },
] as const;
