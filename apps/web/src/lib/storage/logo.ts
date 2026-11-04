import "server-only";
import { unstable_noStore as noStore } from "next/cache";
import { GYM_LOGO_PATH } from "@matos/shared";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Flow audit 10.5: the gym logo for the two pages with no signed-in user
// (free-trial link, kiosk). Service role (Rule 4, same category as those
// pages' other reads), only ever for a gym id the page already resolved.
// The bucket stays private; this hands out a short-lived signed URL.
export async function signedGymLogo(gymId: string): Promise<{ path: string; url: string } | null> {
  noStore();
  const service = createServiceRoleClient();
  const { data: gym } = await service.from("gyms").select("logo_url").eq("id", gymId).maybeSingle();
  const path = gym?.logo_url;
  if (!path || !path.startsWith(`${gymId}/`) || !GYM_LOGO_PATH.test(path)) return null;
  const { data } = await service.storage.from("gym-logos").createSignedUrl(path, 6 * 3600);
  return data?.signedUrl ? { path, url: data.signedUrl } : null;
}
