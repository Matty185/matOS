import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database, Json } from "@/types/database";

type InitiatedBy = Database["public"]["Enums"]["initiated_by"];

type WriteAuditLogParams = {
  gymId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, Json> | null;
  afterState?: Record<string, Json> | null;
  initiatedBy?: InitiatedBy;
  agentQuery?: string | null;
};

// CLAUDE.md: "Audit log writer scrubs: passwords, tokens, raw invite
// tokens, post-deletion identifying data." Applied to both before/after
// state blobs regardless of which entity is being logged, since call sites
// change over time and this is the one place that must never regress.
const SCRUBBED_KEYS = new Set([
  "password",
  "token",
  "token_hash",
  "raw_token",
  "access_token",
  "refresh_token",
]);

function scrub(value: Record<string, Json> | null | undefined): Json | null {
  if (!value) return null;
  const clean: Record<string, Json> = {};
  for (const [key, val] of Object.entries(value)) {
    clean[key] = SCRUBBED_KEYS.has(key.toLowerCase()) ? "[redacted]" : val;
  }
  return clean;
}

// `agent_query` is raw freeform text (a coach's literal chat message), not a
// keyed object — SCRUBBED_KEYS can't apply to it. A coach could accidentally
// paste a password/token into a chat query; this is a coarse safety net
// (redact the whole message rather than try to surgically excise a
// substring) for the rare case, not a precision filter.
const SECRET_LIKE_PATTERN =
  /(password|passwd|api[_-]?key|secret|bearer|access[_-]?token)\s*[:=]?\s*\S{6,}|[A-Za-z0-9_-]{25,}/i;

function scrubAgentQuery(query: string | null | undefined): string | null {
  if (!query) return null;
  return SECRET_LIKE_PATTERN.test(query)
    ? "[redacted — message text withheld, resembled a secret/token]"
    : query;
}

/**
 * Insert-only, service-role write into audit_log — matches Stage 1 RLS
 * (no authenticated INSERT policy exists; the table's own trigger also
 * blocks UPDATE/DELETE outright except for GDPR actor anonymisation).
 * Never throws: a failed audit write must not roll back or fail the
 * primary operation it's describing.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("audit_log").insert({
    gym_id: params.gymId,
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before_state: scrub(params.beforeState),
    after_state: scrub(params.afterState),
    initiated_by: params.initiatedBy ?? "coach_manual",
    agent_query: scrubAgentQuery(params.agentQuery),
  });

  if (error) {
    console.error("[audit] failed to write audit_log row", error);
  }
}
