import { z } from "zod";

// Threaded through every write-tool schema so the executing REST endpoint's
// own audit_log row can record initiated_by:'agent' + the raw natural-
// language query (CLAUDE.md: "Every agent action writes an audit_log row
// including the raw natural-language query"), on top of the wrapper row
// /api/agent itself writes for the turn. Absent entirely on a normal
// dashboard-initiated request, so those keep logging as coach_manual.
export const agentQueryField = z.string().trim().max(2000).optional();

export const agentRequestSchema = z.object({
  query: z.string().trim().min(1, "Ask something.").max(2000),
  // Client-side history only, per plan §6 ("In-session history only, client-
  // side, passed per request"). Content is untrusted member-adjacent text by
  // the time it round-trips — validated shape only, never reinterpreted as
  // instructions server-side beyond its role in the message list itself.
  conversation_history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(40)
    .default([]),
});

export type AgentRequestInput = z.infer<typeof agentRequestSchema>;
