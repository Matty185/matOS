import "server-only";
import type { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

type ServiceRoleClient = ReturnType<typeof createSupabaseClient<Database>>;

// Supabase's Admin API has no getUserByEmail — listUsers() is the
// documented way to look one up, paginated. Mirrors scripts/seed.ts's own
// findAuthUserByEmail exactly (same pagination-safe loop); duplicated
// rather than shared because seed.ts is a standalone script outside
// apps/web's module graph, not because the logic differs.
export async function findUserByEmail(supabase: ServiceRoleClient, email: string) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}
