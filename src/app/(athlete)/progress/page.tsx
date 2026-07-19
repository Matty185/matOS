import { getCurrentMember } from "@/lib/auth/current-member";
import { createClient } from "@/lib/supabase/server";
import { ProgressClient } from "@/components/shared/progress-client";

export default async function ProgressPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const supabase = createClient();
  const { data: memberRow } = await supabase
    .from("members")
    .select("join_date")
    .eq("id", member.memberId)
    .single();

  return (
    <ProgressClient
      memberId={member.memberId}
      joinDate={memberRow?.join_date ?? new Date().toISOString().slice(0, 10)}
    />
  );
}
