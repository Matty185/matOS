import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@matos/shared";

// Flow audit 2.6 / 10.5: removes every object under a folder of a bucket
// (one level of files, which is how member-photos/<gym>/<member>/ and
// gym-logos/<gym>/ are laid out). Service-role client only: used by GDPR
// erasure and solo deletion. Returns false if listing or removal failed.
export async function purgeStorageFolder(
  service: SupabaseClient<Database>,
  bucket: "member-photos" | "gym-logos",
  folder: string,
): Promise<boolean> {
  const { data, error } = await service.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) {
    console.error(`[storage] list ${bucket}/${folder} failed`, error);
    return false;
  }
  const paths = (data ?? []).filter((o) => o.id !== null).map((o) => `${folder}/${o.name}`);
  if (paths.length === 0) return true;
  const { error: removeError } = await service.storage.from(bucket).remove(paths);
  if (removeError) {
    console.error(`[storage] remove under ${bucket}/${folder} failed`, removeError);
    return false;
  }
  return true;
}
