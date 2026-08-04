// Thin wrapper around the deployed apps/web instance's public API routes —
// mobile has no backend of its own and never will (Rule 4's service-role
// boundary stays web-only). Only used for the handful of routes that need
// service-role logic before a session exists (signup, invite claim/attach)
// — everything else (login, and every authenticated read/write once a
// session exists) goes straight to Supabase via src/lib/supabase.ts,
// exactly like apps/web's own browser client does.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

export type ApiErrorBody = { error: string; code: string; status: number };

const NETWORK_ERROR: ApiErrorBody = {
  error: "Couldn't reach the server. Check your connection and try again.",
  code: "network_error",
  status: 0,
};

export async function apiPost<TBody extends object>(
  path: string,
  body: TBody,
): Promise<{ ok: true; data: unknown } | { ok: false; error: ApiErrorBody }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

export async function apiGet(
  path: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: ApiErrorBody }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`);
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json as ApiErrorBody };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
