import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/response";
import type { Database } from "@/types/database";

type Role = Database["public"]["Enums"]["member_role"];

// gym_owner > coach > athlete per CLAUDE.md Rule 3 — a requiredRole of
// 'coach' also admits 'gym_owner'.
const ROLE_RANK: Record<Role, number> = {
  athlete: 0,
  coach: 1,
  gym_owner: 2,
};

export type AuthContext = {
  userId: string;
  memberId: string;
  gymId: string;
  role: Role;
};

type Handler<TInput> = (
  request: NextRequest,
  context: AuthContext,
  input: TInput,
) => Promise<Response>;

type WithAuthOptions<TInput> = {
  requiredRole?: Role;
  schema?: z.ZodType<TInput>;
  // Rate limiting is agent-route-only per CLAUDE.md ("rate limit (agent
  // route only)") — not implemented here since no agent route exists yet
  // (Stage 7). This flag is a deliberate extension point so Stage 7 doesn't
  // have to restructure this file; it currently does nothing.
  rateLimit?: boolean;
};

/**
 * Wraps an API route handler per CLAUDE.md Rule 5:
 * session -> gym_id match -> role -> Zod input validation -> (rate limit,
 * agent-only, not yet wired). gym_id is derived server-side from the
 * caller's own `members` row and injected into context — route handlers
 * must use it instead of trusting any gym_id in the request body, matching
 * the "gym_id injected server-side, never trusted from input" posture used
 * throughout this project (see the agentic interface rules for the same
 * principle applied to the agent's tool calls).
 */
export function withAuth<TInput = undefined>(
  handler: Handler<TInput>,
  options: WithAuthOptions<TInput> = {},
) {
  return async (request: NextRequest): Promise<Response> => {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return apiError(401, "UNAUTHENTICATED", "You must be signed in.");
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, gym_id, role, active")
      .eq("user_id", user.id)
      .single();

    if (memberError || !member) {
      return apiError(403, "NO_MEMBER_RECORD", "No member record for this account.");
    }

    if (!member.active) {
      return apiError(403, "MEMBER_INACTIVE", "This account has been deactivated.");
    }

    if (options.requiredRole && ROLE_RANK[member.role] < ROLE_RANK[options.requiredRole]) {
      return apiError(403, "FORBIDDEN", "You don't have permission to do that.");
    }

    let input: TInput = undefined as TInput;
    if (options.schema) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError(400, "INVALID_BODY", "Request body must be valid JSON.");
      }

      const parsed = options.schema.safeParse(body);
      if (!parsed.success) {
        return apiError(400, "VALIDATION_ERROR", "Invalid request data.");
      }
      input = parsed.data;
    }

    const context: AuthContext = {
      userId: user.id,
      memberId: member.id,
      gymId: member.gym_id,
      role: member.role,
    };

    try {
      return await handler(request, context, input);
    } catch (error) {
      console.error("[withAuth] unhandled error in route handler", error);
      return apiError(500, "INTERNAL_ERROR", "Something went wrong — the change wasn't saved.");
    }
  };
}
