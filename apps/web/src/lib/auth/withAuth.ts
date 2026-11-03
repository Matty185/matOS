import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api/response";
import { getBearerToken } from "@/lib/auth/bearer-token";
import type { Database } from "@matos/shared";

type Role = Database["public"]["Enums"]["member_role"];
type GymKind = Database["public"]["Enums"]["gym_kind"];

// gym_owner > coach > athlete per CLAUDE.md Rule 3 — a requiredRole of
// 'coach' also admits 'gym_owner'. A guardian (parent account, flow audit
// 8.2) ranks with athletes: never staff.
const ROLE_RANK: Record<Role, number> = {
  athlete: 0,
  guardian: 0,
  coach: 1,
  gym_owner: 2,
};

export type AuthContext = {
  userId: string;
  memberId: string;
  gymId: string;
  gymKind: GymKind;
  role: Role;
};

// Next.js populates this for any dynamic route segment (the second
// argument every App Router route handler receives). Threading it through
// properly, instead of each handler re-parsing request.nextUrl.pathname
// with a hardcoded `.at(-N)` — found in Stage 4 security review: today's
// three nested routes are safe, but that pattern silently breaks the
// moment a copy-pasted route sits at a different nesting depth, and
// Stages 5-8 add several more dynamic segments.
type RouteParams = Record<string, string>;

type Handler<TInput> = (
  request: NextRequest,
  context: AuthContext,
  input: TInput,
  params: RouteParams,
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
 *
 * The member lookup below resolves via the `public.current_member()` RPC
 * (Stage S2 migration 20260803120000), not a direct `.eq("user_id",
 * user.id).single()` query — see current-member.ts's own comment for why
 * that direct-query shape became ambiguous once Stage S1 let one account
 * hold more than one `members` row. Every API route's gymId now agrees
 * with what RLS itself resolves for the same request.
 */
export function withAuth<TInput = undefined>(
  handler: Handler<TInput>,
  options: WithAuthOptions<TInput> = {},
) {
  return async (
    request: NextRequest,
    routeContext?: { params?: RouteParams },
  ): Promise<Response> => {
    const supabase = createClient();

    // A bearer token (mobile) has no session state on this stateless
    // per-request client (createClient() set persistSession: false for
    // this path) — getUser() must be handed the token explicitly rather
    // than reading it from client-side session storage, which is what it
    // falls back to when called with no argument at all. Cookie-based web
    // callers are unaffected: no header, same no-argument call as before.
    const bearerToken = getBearerToken();

    const {
      data: { user },
      error: authError,
    } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();

    if (authError || !user) {
      return apiError(401, "UNAUTHENTICATED", "You must be signed in.");
    }

    const { data: members, error: memberError } = await supabase.rpc("current_member");
    const member = members?.[0];

    if (memberError || !member) {
      return apiError(403, "NO_MEMBER_RECORD", "No member record for this account.");
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
      gymKind: member.gym_kind,
      role: member.role,
    };

    try {
      return await handler(request, context, input, routeContext?.params ?? {});
    } catch (error) {
      console.error("[withAuth] unhandled error in route handler", error);
      return apiError(500, "INTERNAL_ERROR", "Something went wrong — the change wasn't saved.");
    }
  };
}
