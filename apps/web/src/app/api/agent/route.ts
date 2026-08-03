import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { apiError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit/log";
import { agentRequestSchema } from "@matos/shared";
import {
  ALL_TOOLS,
  WRITE_TOOL_NAMES,
  READ_TOOL_NAMES,
  WRITE_TOOL_ENDPOINTS,
} from "@/lib/agent/tools";
import { executeReadTool } from "@/lib/agent/read-tools";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import { trailingMonthWindow, getOverdueMemberIds } from "@/lib/payments/overdue";

const RATE_LIMIT_WARNING_AT = 40;
const RATE_LIMIT_BLOCK_AT = 50;
const MAX_TOOL_ITERATIONS = 6;

const anthropic = new Anthropic();

type PendingWriteCall = {
  tool: string;
  label: string;
  memberName: string | null;
  endpoint: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  requiresTypedConfirmation: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  update_payment_status: "Update payment status",
  update_member: "Update member details",
  update_belt: "Promote belt",
  create_class: "Create class",
  deactivate_member: "Deactivate member",
  create_attendance: "Mark attendance",
};

// POST /api/agent — coach/owner only. Per plan §6: Haiku 4.5, full response
// (no streaming), in-session history passed per request (no server-side
// conversation storage), gym_id/context injected server-side only. Read
// tools execute inline against the RLS client; write tools are only ever
// proposed here — the client calls the real REST endpoint directly once the
// coach confirms (see src/lib/agent/tools.ts WRITE_TOOL_ENDPOINTS), so every
// write still goes through the same withAuth + Zod validation as a normal
// dashboard action regardless of what the model returned.
export const POST = withAuth(
  async (_request, context, input) => {
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);

    // Rate limit: atomic increment-and-return via RPC (own-row, RLS-backed —
    // CLAUDE.md: "the agent uses the RLS client exclusively"). A plain
    // read-then-upsert here would be a check-then-act race under concurrent
    // requests from the same coach (each reading the same stale count and
    // both writing count+1, losing an increment and letting the hard block
    // be bypassed) — the same bug class already fixed once for invite
    // attempt_count (20260716140000_atomic_invite_attempt_increment.sql).
    // The *returned* count is authoritative for the block/warning decision,
    // never a pre-fetched one.
    const { data: newCount, error: rateLimitRpcError } = await supabase.rpc(
      "increment_agent_query_count",
      { p_gym_id: context.gymId, p_date: today },
    );

    if (rateLimitRpcError || newCount === null) {
      console.error("[agent] failed to increment query count", rateLimitRpcError);
      return apiError(500, "INTERNAL_ERROR", "Something went wrong — try again.");
    }

    if (newCount > RATE_LIMIT_BLOCK_AT) {
      return apiError(
        429,
        "AGENT_RATE_LIMIT",
        "You've reached today's limit of 50 assistant queries. It resets at midnight.",
      );
    }
    const rateLimitWarning = newCount >= RATE_LIMIT_WARNING_AT;

    // Server-computed context injected into the system prompt — gym name,
    // coach name, active member count, overdue count — never taken from the
    // model or client input.
    const [{ data: gym }, { data: coachMember }, { count: activeMemberCount }] = await Promise.all([
      supabase.from("gyms").select("name").eq("id", context.gymId).single(),
      supabase.from("members").select("first_name, last_name").eq("id", context.memberId).single(),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("active", true),
    ]);

    const overdueWindow = trailingMonthWindow(6);
    const minYear = overdueWindow[0]!.year;
    const maxYear = overdueWindow[overdueWindow.length - 1]!.year;
    const [{ data: overdueMembers }, { data: overduePayments }] = await Promise.all([
      supabase.from("members").select("id, join_date").eq("active", true),
      supabase
        .from("payments")
        .select("member_id, period_month, period_year, status")
        .gte("period_year", minYear)
        .lte("period_year", maxYear),
    ]);
    const overdueCount = getOverdueMemberIds(
      overdueMembers ?? [],
      overduePayments ?? [],
      overdueWindow,
    ).size;

    const systemPrompt = buildSystemPrompt({
      gymName: gym?.name ?? "your gym",
      coachName: coachMember ? `${coachMember.first_name} ${coachMember.last_name}` : "Coach",
      currentDate: today,
      activeMemberCount: activeMemberCount ?? 0,
      overdueCount,
    });

    const messages: Anthropic.MessageParam[] = [
      ...input.conversation_history.map(
        (m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam,
      ),
      { role: "user", content: input.query },
    ];

    let finalAnswerText = "";
    let pendingToolUse: Anthropic.ToolUseBlock[] = [];
    let sawUnrecoverableError = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      let response: Anthropic.Message;
      try {
        response = await anthropic.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 2048,
          system: systemPrompt,
          tools: ALL_TOOLS,
          messages,
        });
      } catch (err) {
        console.error("[agent] Claude API call failed", err);
        sawUnrecoverableError = true;
        break;
      }

      if (response.stop_reason !== "tool_use") {
        finalAnswerText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const writeBlocks = toolUseBlocks.filter((b) => WRITE_TOOL_NAMES.has(b.name));
      const readBlocks = toolUseBlocks.filter((b) => READ_TOOL_NAMES.has(b.name));

      if (writeBlocks.length > 0) {
        finalAnswerText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        pendingToolUse = writeBlocks;
        break;
      }

      if (readBlocks.length === 0) {
        // Model claimed tool_use but named nothing we recognize.
        sawUnrecoverableError = true;
        break;
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of readBlocks) {
        try {
          const result = await executeReadTool(
            block.name,
            block.input as Record<string, unknown>,
            supabase,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result ?? []),
          });
        } catch (err) {
          console.error(`[agent] read tool ${block.name} failed`, err);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "That lookup failed — the underlying data couldn't be read.",
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    let body: Record<string, unknown>;

    if (sawUnrecoverableError) {
      body = { type: "error", content: "Something went wrong — try rephrasing your question." };
    } else if (pendingToolUse.length > 0) {
      const memberIds = new Set<string>();
      for (const block of pendingToolUse) {
        const raw = (block.input as Record<string, unknown>).member_id;
        if (typeof raw === "string") memberIds.add(raw);
      }
      let namesById = new Map<string, string>();
      if (memberIds.size > 0) {
        const { data: members } = await supabase
          .from("members")
          .select("id, first_name, last_name")
          .in("id", Array.from(memberIds));
        namesById = new Map((members ?? []).map((m) => [m.id, `${m.first_name} ${m.last_name}`]));
      }

      const pending: PendingWriteCall[] = [];
      for (const block of pendingToolUse) {
        const endpoint = WRITE_TOOL_ENDPOINTS[block.name];
        if (!endpoint) continue;
        const rawInput = block.input as Record<string, unknown>;
        try {
          pending.push({
            tool: block.name,
            label: TOOL_LABELS[block.name] ?? block.name,
            memberName:
              typeof rawInput.member_id === "string"
                ? (namesById.get(rawInput.member_id) ?? null)
                : null,
            endpoint: endpoint.path(rawInput),
            method: endpoint.method,
            body: endpoint.body(rawInput),
            requiresTypedConfirmation: block.name === "deactivate_member",
          });
        } catch (err) {
          console.error(`[agent] failed to build confirmation for ${block.name}`, err);
        }
      }

      if (pending.length === 0) {
        body = { type: "error", content: "Something went wrong — try rephrasing your question." };
      } else {
        body = {
          type: "confirmation",
          content: finalAnswerText || "Here's what I'll do:",
          tool_call: pending,
        };
      }
    } else if (finalAnswerText) {
      body = { type: "answer", content: finalAnswerText };
    } else {
      body = { type: "error", content: "Something went wrong — try rephrasing your question." };
    }

    await writeAuditLog({
      gymId: context.gymId,
      actorId: context.userId,
      action: "agent.query",
      entityType: "agent",
      afterState: {
        response_type: body.type as string,
        proposed_tools: pendingToolUse.map((b) => b.name),
      },
      initiatedBy: "agent",
      agentQuery: input.query,
    });

    return NextResponse.json({ ...body, rate_limit_warning: rateLimitWarning });
  },
  // withAuth's `rateLimit` flag is still a documented no-op (see withAuth.ts)
  // — the 40/50-per-day rule needs per-day upsert + warning-threshold
  // semantics a generic boolean doesn't fit, so it's implemented directly
  // above using the RLS client, consistent with "the agent uses the RLS
  // client exclusively."
  { requiredRole: "coach", schema: agentRequestSchema },
);
