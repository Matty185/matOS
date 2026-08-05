import { NextResponse } from "next/server";

/**
 * Consistent error shape per CLAUDE.md Rule 5: `{ error, code, status }`,
 * never leaking internals. `message` is the only text shown to the client —
 * anything else (stack traces, DB errors) belongs in a server-side
 * console.error call at the call site, not in the response body.
 */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: message, code, status },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
