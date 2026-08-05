import { supabase } from "@/lib/supabase";

// Thin wrapper around the deployed apps/web instance's public API routes —
// mobile has no backend of its own and never will (Rule 4's service-role
// boundary stays web-only). Used both for the handful of routes that need
// service-role logic before a session exists (signup, invite claim/attach)
// and, since Stage M1, for authenticated routes whose server-side business
// rules or audit-log writes shouldn't be re-implemented separately on
// mobile (e.g. check-in's window validation, the Logs audit trail) — see
// apps/web/src/lib/supabase/server.ts's own Stage M1 comment for the other
// half of this: mobile has no cookies to carry a session, so the current
// Supabase access token is forwarded as `Authorization: Bearer <token>`
// instead, and withAuth validates that token directly. Everything else
// (login, and most authenticated reads/writes) goes straight to Supabase
// via src/lib/supabase.ts, exactly like apps/web's own browser client does.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

export type ApiErrorBody = { error: string; code: string; status: number };
type ApiResult = { ok: true; data: unknown } | { ok: false; error: ApiErrorBody };

const NETWORK_ERROR: ApiErrorBody = {
  error: "Couldn't reach the server. Check your connection and try again.",
  code: "network_error",
  status: 0,
};

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function request(path: string, init: RequestInit): Promise<ApiResult> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...(await authHeaders()), ...init.headers },
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json as ApiErrorBody };
    return { ok: true, data: json };
  } catch {
    // A phone's connectivity is far less reliable than a browser tab's —
    // offline, DNS failure, or a non-JSON gateway error page all throw
    // here rather than producing a res.ok === false response.
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function apiGet(path: string): Promise<ApiResult> {
  return request(path, { method: "GET" });
}

export async function apiPost<TBody extends object>(path: string, body: TBody): Promise<ApiResult> {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPatch<TBody extends object>(
  path: string,
  body: TBody,
): Promise<ApiResult> {
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string): Promise<ApiResult> {
  return request(path, { method: "DELETE" });
}
