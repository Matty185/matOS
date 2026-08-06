import "server-only";
import { createClient } from "@/lib/supabase/server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

// Stage M6 ("Push sends wired... via Supabase -> Expo push"). Reads the
// target member's push_tokens via the RLS-respecting client, not
// service-role (CLAUDE.md Rule 4 scopes service-role to invite
// generation/audit log inserts/seeding only) — the new
// push_tokens_select_staff/_delete_staff policies (this stage's own
// migration) are what let a staff caller read/prune another member's
// tokens; RLS stays the actual boundary, not an app-layer bypass. Both
// current call sites (belt promotion, breakdown-created-for-another-
// member) are already staff-only actions per their own route guards, so
// there's no path where a non-staff caller reaches this with a
// memberId that isn't their own.
//
// Best-effort, never throws: a push failure must never fail the write it
// rides along with (same posture as writeAuditLog's own call sites, and
// belt_history's own "logged loudly, not thrown" precedent in the
// promote route). No real EAS project is linked yet (Stage M0's known
// gap), so `expo_push_token` rows may not exist at all in this
// environment — an empty token list is a normal, silent no-op, not an
// error.
export async function sendPushToMember(
  memberId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    const supabase = createClient();
    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("id, expo_push_token")
      .eq("member_id", memberId);

    if (error || !tokens || tokens.length === 0) return;

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(
        tokens.map((t) => ({
          to: t.expo_push_token,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        })),
      ),
    });

    if (!response.ok) {
      console.error("[push] Expo push API returned", response.status);
      return;
    }

    const json = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = json.data;
    if (!tickets) return;

    // A DeviceNotRegistered ticket means Expo itself has confirmed this
    // token is dead (app uninstalled, token rotated) — prune it so the
    // next send to this member doesn't keep retrying a token that will
    // never succeed. Every other error status is left alone (could be
    // transient) rather than guessed at.
    const staleTokenIds = tickets
      .map((ticket, i) =>
        ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
          ? tokens[i]?.id
          : null,
      )
      .filter((id): id is string => id !== null && id !== undefined);

    if (staleTokenIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleTokenIds);
    }
  } catch (error) {
    console.error("[push] sendPushToMember failed", error);
  }
}
