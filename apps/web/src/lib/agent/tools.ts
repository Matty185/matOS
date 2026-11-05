import type Anthropic from "@anthropic-ai/sdk";
import { CLASS_PROGRAM_VALUES, METRIC_NAMES } from "@matos/shared";

const BELT_VALUES = [
  "white",
  "grey_white",
  "grey",
  "grey_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
  "blue",
  "purple",
  "brown",
  "black",
];
const CLASS_TYPE_VALUES = ["gi", "no_gi", "comp", "open_mat"];
const PLAN_VALUES = ["monthly", "casual", "comp_team"];
const PAYMENT_STATUS_VALUES = ["paid", "unpaid", "waived"];

// Read tools execute immediately, server-side, using the RLS-respecting
// client (CLAUDE.md: "the agent uses the RLS client exclusively") — never
// the service-role client. Per plan §6 exact list.
export const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_members",
    description:
      "List members in the academy, optionally filtered. Use this for browsing/counting; use get_member to look up a specific person by name.",
    input_schema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description: "Match against first or last name (partial, case-insensitive).",
        },
        belt: { type: "string", enum: BELT_VALUES },
        active: {
          type: "boolean",
          description: "Filter to active (true) or deactivated (false) members.",
        },
        role: {
          type: "string",
          enum: ["athlete", "coach", "gym_owner"],
          description: "Filter by role, e.g. coach or gym_owner to find who can teach a class.",
        },
      },
    },
  },
  {
    name: "get_member",
    description:
      "Look up a specific member by name. Returns every matching member with distinguishing detail (belt, join date, plan) so you can disambiguate — if more than one match comes back, list them for the coach and ask which one, rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full or partial name to search for." },
      },
      required: ["name"],
    },
  },
  {
    name: "get_attendance",
    description: "Get attendance records, optionally filtered by member and/or date range.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string", description: "UUID of a specific member." },
        date_from: { type: "string", description: "ISO date (YYYY-MM-DD), inclusive." },
        date_to: { type: "string", description: "ISO date (YYYY-MM-DD), inclusive." },
      },
    },
  },
  {
    name: "get_payments",
    description: "Get payment records, optionally filtered by member, period, or status.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string", description: "UUID of a specific member." },
        period_month: { type: "integer", minimum: 1, maximum: 12 },
        period_year: { type: "integer" },
        status: { type: "string", enum: PAYMENT_STATUS_VALUES },
      },
    },
  },
  {
    name: "get_classes",
    description:
      "List the academy's recurring weekly classes (with programme, e.g. kids or fundamentals, and coach name when set), plus any one-off cancelled or moved sessions in the next 14 days (a cancelled session does not run that date).",
    input_schema: {
      type: "object",
      properties: {
        day_of_week: {
          type: "integer",
          minimum: 0,
          maximum: 6,
          description: "0=Sunday..6=Saturday.",
        },
        active_only: {
          type: "boolean",
          description: "Default true — set false to include deactivated classes.",
        },
      },
    },
  },
  {
    name: "get_belt_history",
    description:
      "Get a specific member's belt promotion history, most recent first. A row with is_initial=true is the rank they joined/were imported at, not a promotion.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
      },
      required: ["member_id"],
    },
  },
  {
    name: "get_overdue_payments",
    description:
      "List members currently overdue on payment (unpaid status for a period that has already ended, computed live — never a stored flag) within the trailing 6-month window.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_audit_log",
    description: "Get recent audit log entries for the academy, most recent first.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Default 10, max 50." },
      },
    },
  },
  {
    name: "get_external_person",
    description:
      "Look up an external person (an opponent/analyst record, not an academy member) by name, to find their id before calling get_athlete_profile/get_metric/compare_profiles/get_breakdowns with external_person_id. Returns every matching person — if more than one comes back, list them for the coach and ask which one, rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full or partial name to search for." },
      },
      required: ["name"],
    },
  },
  {
    name: "get_athlete_profile",
    description:
      "Get a computed match-analysis profile for an academy member or external person: style card, wrestling/passing/guard/submission/escape success rates, all as factual numbers with their sample size (n). Never returns coaching advice — if asked what someone should work on, report the metrics with the smallest n or weakest values, factually, and stop there.",
    input_schema: {
      type: "object",
      properties: {
        member_id: {
          type: "string",
          description:
            "UUID of an academy member. Exactly one of member_id/external_person_id is required.",
        },
        external_person_id: {
          type: "string",
          description: "UUID of an external person (opponent/analyst record).",
        },
        gi: {
          type: "boolean",
          description: "true for gi, false for no-gi. Omit to get both rulesets.",
        },
      },
    },
  },
  {
    name: "get_metric",
    description:
      "Get one specific named metric for an academy member or external person (e.g. takedown success rate). Use this instead of get_athlete_profile when the coach asks about a single number.",
    input_schema: {
      type: "object",
      properties: {
        member_id: {
          type: "string",
          description:
            "UUID of an academy member. Exactly one of member_id/external_person_id is required.",
        },
        external_person_id: { type: "string", description: "UUID of an external person." },
        metric_name: { type: "string", enum: METRIC_NAMES },
        gi: {
          type: "boolean",
          description: "true for gi, false for no-gi. Omit to get both rulesets.",
        },
      },
      required: ["metric_name"],
    },
  },
  {
    name: "compare_profiles",
    description:
      "Compare two computed profiles (academy members and/or external people) side by side, same metrics for both. Factual numbers only — never recommend who is 'better,' just report both sets of numbers.",
    input_schema: {
      type: "object",
      properties: {
        member_id_a: { type: "string", description: "Subject A: UUID of an academy member." },
        external_person_id_a: {
          type: "string",
          description: "Subject A: UUID of an external person.",
        },
        member_id_b: { type: "string", description: "Subject B: UUID of an academy member." },
        external_person_id_b: {
          type: "string",
          description: "Subject B: UUID of an external person.",
        },
        gi: {
          type: "boolean",
          description: "true for gi, false for no-gi. Omit to get both rulesets.",
        },
      },
    },
  },
  {
    name: "get_breakdowns",
    description:
      "List match breakdowns (name, date, gi, status, result), optionally filtered by member/external person and/or match date range.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
        external_person_id: { type: "string" },
        date_from: {
          type: "string",
          description: "ISO date (YYYY-MM-DD), inclusive, by match_date.",
        },
        date_to: {
          type: "string",
          description: "ISO date (YYYY-MM-DD), inclusive, by match_date.",
        },
      },
    },
  },
];

// Write tools NEVER execute server-side. The model proposes one, the route
// stops the loop and returns it to the client as a pending confirmation;
// only after the coach confirms does the client call the real REST endpoint
// directly (plan §5: "Confirmed writes from the agent go through the
// RESTful resource endpoints directly... not back through /api/agent").
export const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: "update_payment_status",
    description:
      "Record or change a member's payment status for a specific month. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
        period_month: { type: "integer", minimum: 1, maximum: 12 },
        period_year: { type: "integer" },
        status: { type: "string", enum: PAYMENT_STATUS_VALUES },
        amount: { type: "number", description: "Optional amount." },
        notes: { type: "string" },
      },
      required: ["member_id", "period_month", "period_year", "status"],
    },
  },
  {
    name: "update_member",
    description:
      "Edit a member's contact/plan/notes fields. This REPLACES the full editable record, so call get_member first and include every field — changed and unchanged — not just the one being updated. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
        first_name: { type: "string" },
        last_name: { type: "string" },
        phone: { type: "string" },
        emergency_contact_name: { type: "string" },
        emergency_contact_phone: { type: "string" },
        membership_plan: { type: "string", enum: PLAN_VALUES },
        notes: { type: "string" },
      },
      required: ["member_id", "first_name", "last_name", "membership_plan"],
    },
  },
  {
    name: "update_belt",
    description:
      "Promote a member to a new belt/stripe level. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
        belt: { type: "string", enum: BELT_VALUES },
        stripes: { type: "integer", minimum: 0, maximum: 4 },
        notes: { type: "string" },
      },
      required: ["member_id", "belt", "stripes"],
    },
  },
  {
    name: "create_class",
    description:
      "Create a new recurring weekly class. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        class_type: { type: "string", enum: CLASS_TYPE_VALUES },
        day_of_week: {
          type: "integer",
          minimum: 0,
          maximum: 6,
          description: "0=Sunday..6=Saturday.",
        },
        start_time: { type: "string", description: "HH:MM, 24-hour." },
        duration_minutes: { type: "integer", minimum: 1, maximum: 600 },
        max_capacity: { type: "integer" },
        program: {
          type: "string",
          enum: [...CLASS_PROGRAM_VALUES],
          description: "Who the class is for. Defaults to all_levels.",
        },
        coach_member_id: {
          type: ["string", "null"],
          description:
            "Member id of the coach who teaches it: an active coach or owner (get_members with role coach or gym_owner). null removes the coach.",
        },
      },
      required: ["name", "class_type", "day_of_week", "start_time", "duration_minutes"],
    },
  },
  {
    name: "update_class",
    description:
      "Change an existing class: its coach, programme, name, type, day, time, length, capacity, or active flag. Pass class_id (from get_classes) and ONLY the fields that change; everything else stays as it is. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        class_id: { type: "string", description: "UUID of the class, from get_classes." },
        name: { type: "string" },
        class_type: { type: "string", enum: CLASS_TYPE_VALUES },
        day_of_week: {
          type: "integer",
          minimum: 0,
          maximum: 6,
          description: "0=Sunday..6=Saturday.",
        },
        start_time: { type: "string", description: "HH:MM, 24-hour." },
        duration_minutes: { type: "integer", minimum: 1, maximum: 600 },
        max_capacity: { type: ["integer", "null"] },
        program: { type: "string", enum: [...CLASS_PROGRAM_VALUES] },
        coach_member_id: {
          type: ["string", "null"],
          description:
            "Member id of the coach who teaches it: an active coach or owner (get_members with role coach or gym_owner). null removes the coach.",
        },
        active: { type: "boolean", description: "false hides the class from the timetable." },
      },
      required: ["class_id"],
    },
  },
  {
    name: "deactivate_member",
    description:
      'Deactivate a member (soft delete — members are never hard-deleted). This is destructive and requires the coach to TYPE "yes" or "confirm", not just click a button, before it takes effect.',
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
      },
      required: ["member_id"],
    },
  },
  {
    name: "create_attendance",
    description:
      "Mark a member present for a class, optionally backdated. Requires coach confirmation before it takes effect.",
    input_schema: {
      type: "object",
      properties: {
        member_id: { type: "string" },
        class_id: { type: "string" },
        checked_in_at: { type: "string", description: "Optional ISO datetime; defaults to now." },
      },
      required: ["member_id", "class_id"],
    },
  },
];

export const ALL_TOOLS: Anthropic.Tool[] = [...READ_TOOLS, ...WRITE_TOOLS];
export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));
export const READ_TOOL_NAMES = new Set(READ_TOOLS.map((t) => t.name));

// Maps a write tool call to the RESTful endpoint the CLIENT calls directly
// after the coach confirms — the agent route itself never calls these.
// `params` extracts the request body from the tool's raw input, dropping
// the id fields that belong in the URL instead.
export const WRITE_TOOL_ENDPOINTS: Record<
  string,
  {
    method: "POST" | "PATCH";
    path: (input: Record<string, unknown>) => string;
    body: (input: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  update_payment_status: {
    method: "POST",
    path: () => "/api/payments/record",
    body: (input) => ({
      member_id: input.member_id,
      period_month: input.period_month,
      period_year: input.period_year,
      status: input.status,
      amount: input.amount ?? null,
      notes: input.notes ?? undefined,
    }),
  },
  update_member: {
    method: "PATCH",
    path: (input) => `/api/members/${input.member_id}`,
    body: (input) => ({
      first_name: input.first_name,
      last_name: input.last_name,
      phone: input.phone ?? "",
      emergency_contact_name: input.emergency_contact_name ?? "",
      emergency_contact_phone: input.emergency_contact_phone ?? "",
      membership_plan: input.membership_plan,
      notes: input.notes ?? "",
    }),
  },
  update_belt: {
    method: "POST",
    path: (input) => `/api/members/${input.member_id}/promote`,
    body: (input) => ({
      belt: input.belt,
      stripes: input.stripes,
      notes: input.notes ?? "",
    }),
  },
  create_class: {
    method: "POST",
    path: () => "/api/classes",
    body: (input) => ({
      name: input.name,
      class_type: input.class_type,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      duration_minutes: input.duration_minutes,
      max_capacity: input.max_capacity ?? null,
      ...(input.program ? { program: input.program } : {}),
      ...(typeof input.coach_member_id === "string"
        ? { coach_member_id: input.coach_member_id }
        : {}),
    }),
  },
  // The agent route merges the model's changes onto the current class row
  // (mergeClassUpdate) before this runs, because PATCH /api/classes/[id]
  // takes the full record. Coach and programme are only sent when changed,
  // so the route leaves them as stored otherwise.
  update_class: {
    method: "PATCH",
    path: (input) => `/api/classes/${input.class_id}`,
    body: (input) => ({
      name: input.name,
      class_type: input.class_type,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      duration_minutes: input.duration_minutes,
      max_capacity: input.max_capacity ?? null,
      active: input.active,
      ...(input.program !== undefined ? { program: input.program } : {}),
      ...(input.coach_member_id !== undefined ? { coach_member_id: input.coach_member_id } : {}),
    }),
  },
  deactivate_member: {
    method: "POST",
    path: (input) => `/api/members/${input.member_id}/deactivate`,
    body: () => ({ confirm: true }),
  },
  create_attendance: {
    method: "POST",
    path: () => "/api/attendance/mark",
    body: (input) => ({
      member_id: input.member_id,
      class_id: input.class_id,
      checked_in_at: input.checked_in_at ?? undefined,
    }),
  },
};
