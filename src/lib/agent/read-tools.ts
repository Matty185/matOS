import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  trailingMonthWindow,
  getOverdueMemberIds,
  getOverduePeriodsForMember,
  periodKey,
} from "@/lib/payments/overdue";
import { fetchAthleteProfileData, type ProfileSubject } from "@/lib/analysis/fetch-profile-data";
import { METRIC_CATALOG } from "@/lib/analysis/metric-catalog";

type Client = SupabaseClient<Database>;

// Shared by get_athlete_profile/get_metric/compare_profiles — the model
// supplies member_id XOR external_person_id (mirroring the breakdown
// focus model, Non-Negotiable #2), and this resolves it into the shape
// fetchAthleteProfileData expects. Returns null (not a throw) on a
// missing/ambiguous subject so the tool can hand the model an informative
// object to relay to the coach, matching how get_member/get_belt_history
// handle a missing required param elsewhere in this file, rather than the
// generic "that lookup failed" error the agent route falls back to on a
// thrown error.
function resolveSubject(
  input: Record<string, unknown>,
  suffix: "" | "_a" | "_b" = "",
): ProfileSubject | null {
  const memberId = input[`member_id${suffix}`];
  const externalId = input[`external_person_id${suffix}`];
  // member_id wins if the model somehow supplies both (schema-guided tool
  // calling makes this practically unreachable in normal use) — silently
  // ignoring the extra field rather than erroring is fine here since either
  // resolved subject is still fully RLS-scoped, not a case where picking
  // wrong could leak data across a boundary. Flagged in Stage A7 review as
  // worth a comment since the rest of the data model treats focus as a
  // strict XOR everywhere else (e.g. breakdowns_exactly_one_focus).
  if (typeof memberId === "string" && memberId) return { type: "member", id: memberId };
  if (typeof externalId === "string" && externalId) return { type: "external", id: externalId };
  return null;
}

// Name search happens in-memory rather than as a `first_name.ilike / OR
// last_name.ilike` DB filter: a coach asking about "Priya Overdue" (or the
// model passing a full "first last" name straight through) would never
// match that way, since neither column alone contains the full string —
// found via live testing (the model correctly looked a member up by full
// name; the search silently returned nothing). Splitting into tokens and
// requiring each to appear somewhere in "first last" handles full names,
// partial names, and reversed order. Bounded to alpha member-list scale
// (a few dozen rows), not meant to scale past that.
function matchByName<T extends { first_name: string; last_name: string }>(
  rows: T[],
  query: string,
): T[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return rows;
  return rows.filter((row) => {
    const full = `${row.first_name} ${row.last_name}`.toLowerCase();
    return tokens.every((t) => full.includes(t));
  });
}

// Every query below relies on RLS (this function is only ever called with
// the RLS-respecting server client, never service-role — CLAUDE.md: "the
// agent uses the RLS client exclusively") to scope rows to the caller's own
// gym. No query here trusts a gym_id from tool input — none of the tool
// schemas even accept one, per "gym_id injected server-side... never taken
// from model output."
export async function executeReadTool(
  toolName: string,
  input: Record<string, unknown>,
  supabase: Client,
): Promise<unknown> {
  switch (toolName) {
    case "get_members": {
      let query = supabase
        .from("members")
        .select("id, first_name, last_name, belt, stripes, membership_plan, active, join_date")
        .order("last_name", { ascending: true });
      if (typeof input.belt === "string") query = query.eq("belt", input.belt as never);
      if (typeof input.active === "boolean") query = query.eq("active", input.active);
      const { data, error } = await query;
      if (error) throw error;
      const filtered =
        typeof input.search === "string" && input.search.trim()
          ? matchByName(data ?? [], input.search)
          : (data ?? []);
      return filtered.slice(0, 50);
    }

    case "get_member": {
      const name = String(input.name ?? "").trim();
      if (!name) return [];
      const { data, error } = await supabase
        .from("members")
        .select(
          "id, first_name, last_name, email, phone, belt, stripes, membership_plan, active, join_date",
        );
      if (error) throw error;
      return matchByName(data ?? [], name).slice(0, 10);
    }

    case "get_attendance": {
      let query = supabase
        .from("attendance")
        .select("id, member_id, class_id, checked_in_at, checked_in_by, checked_in_date")
        .order("checked_in_at", { ascending: false })
        .limit(100);
      if (typeof input.member_id === "string") query = query.eq("member_id", input.member_id);
      if (typeof input.date_from === "string")
        query = query.gte("checked_in_date", input.date_from);
      if (typeof input.date_to === "string") query = query.lte("checked_in_date", input.date_to);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "get_payments": {
      let query = supabase
        .from("payments")
        .select("id, member_id, period_month, period_year, status, amount, notes, paid_at")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(100);
      if (typeof input.member_id === "string") query = query.eq("member_id", input.member_id);
      if (typeof input.period_month === "number")
        query = query.eq("period_month", input.period_month);
      if (typeof input.period_year === "number") query = query.eq("period_year", input.period_year);
      if (typeof input.status === "string") query = query.eq("status", input.status as never);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "get_classes": {
      let query = supabase
        .from("classes")
        .select(
          "id, name, class_type, day_of_week, start_time, duration_minutes, max_capacity, active",
        )
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (typeof input.day_of_week === "number") query = query.eq("day_of_week", input.day_of_week);
      if (input.active_only !== false) query = query.eq("active", true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    case "get_belt_history": {
      const memberId = String(input.member_id ?? "");
      if (!memberId) return [];
      const { data, error } = await supabase
        .from("belt_history")
        .select("belt, stripes, promoted_at, notes")
        .eq("member_id", memberId)
        .order("promoted_at", { ascending: false });
      if (error) throw error;
      return data;
    }

    case "get_overdue_payments": {
      const window = trailingMonthWindow(6);
      const minYear = window[0]!.year;
      const maxYear = window[window.length - 1]!.year;
      const [{ data: members, error: membersError }, { data: payments, error: paymentsError }] =
        await Promise.all([
          supabase
            .from("members")
            .select("id, first_name, last_name, join_date")
            .eq("active", true),
          supabase
            .from("payments")
            .select("member_id, period_month, period_year, status")
            .gte("period_year", minYear)
            .lte("period_year", maxYear),
        ]);
      if (membersError) throw membersError;
      if (paymentsError) throw paymentsError;

      const overdueIds = getOverdueMemberIds(members ?? [], payments ?? [], window);
      const statusByKey = new Map(
        (payments ?? []).map((p) => [
          periodKey(p.member_id, { month: p.period_month, year: p.period_year }),
          p.status,
        ]),
      );

      return (members ?? [])
        .filter((m) => overdueIds.has(m.id))
        .map((m) => {
          // Must use the same join-date-aware helper getOverdueMemberIds
          // itself uses, not an independent re-filter of the raw window —
          // a second implementation here previously skipped the join-date
          // check, so a member who joined 2 months ago showed every
          // payment-row-less month in the 6-month window as "overdue,"
          // reporting something like "overdue 5 months" for someone who
          // was never even a member yet for 4 of those months.
          const overduePeriods = getOverduePeriodsForMember(m, statusByKey, window).map(
            (p) => `${p.year}-${String(p.month).padStart(2, "0")}`,
          );
          return {
            member_id: m.id,
            name: `${m.first_name} ${m.last_name}`,
            overdue_periods: overduePeriods,
          };
        });
    }

    case "get_audit_log": {
      const limit = typeof input.limit === "number" ? Math.min(Math.max(input.limit, 1), 50) : 10;
      const { data, error } = await supabase
        .from("audit_log")
        .select("action, entity_type, initiated_by, timestamp")
        .order("timestamp", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    }

    case "get_athlete_profile": {
      const subject = resolveSubject(input);
      if (!subject) {
        return { error: "Provide either member_id or external_person_id." };
      }
      const { gi, noGi } = await fetchAthleteProfileData(supabase, subject);
      if (typeof input.gi === "boolean") return input.gi ? gi : noGi;
      return { gi, noGi };
    }

    case "get_metric": {
      const subject = resolveSubject(input);
      if (!subject) {
        return { error: "Provide either member_id or external_person_id." };
      }
      const metricName = typeof input.metric_name === "string" ? input.metric_name : "";
      const entry = METRIC_CATALOG[metricName];
      if (!entry) {
        return { error: `Unknown metric_name "${metricName}".` };
      }
      const { gi, noGi } = await fetchAthleteProfileData(supabase, subject);
      const profile = input.gi === false ? noGi : gi;
      return { metric: entry.label, ...entry.get(profile) };
    }

    case "compare_profiles": {
      const subjectA = resolveSubject(input, "_a");
      const subjectB = resolveSubject(input, "_b");
      if (!subjectA || !subjectB) {
        return {
          error:
            "Provide subject A (member_id_a or external_person_id_a) and subject B (member_id_b or external_person_id_b).",
        };
      }
      const [dataA, dataB] = await Promise.all([
        fetchAthleteProfileData(supabase, subjectA),
        fetchAthleteProfileData(supabase, subjectB),
      ]);
      const useGi = input.gi !== false;
      return { a: useGi ? dataA.gi : dataA.noGi, b: useGi ? dataB.gi : dataB.noGi };
    }

    case "get_breakdowns": {
      let query = supabase
        .from("breakdowns")
        .select("id, name, match_date, gi, status, result, method, member_id, external_person_id")
        .order("match_date", { ascending: false })
        .limit(50);
      if (typeof input.member_id === "string") query = query.eq("member_id", input.member_id);
      if (typeof input.external_person_id === "string") {
        query = query.eq("external_person_id", input.external_person_id);
      }
      if (typeof input.date_from === "string") query = query.gte("match_date", input.date_from);
      if (typeof input.date_to === "string") query = query.lte("match_date", input.date_to);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }

    default:
      throw new Error(`Unknown read tool: ${toolName}`);
  }
}
