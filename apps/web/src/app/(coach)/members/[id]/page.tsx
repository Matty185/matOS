import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberProfileClient } from "@/components/shared/member-profile-client";
import { getCurrentMember } from "@/lib/auth/current-member";

export default async function MemberProfilePage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: member } = await supabase.from("members").select("*").eq("id", params.id).single();
  if (!member) notFound();

  const [{ data: invite }, { data: consent }] = await Promise.all([
    supabase
      .from("invites")
      .select("claimed_at, expires_at")
      .eq("member_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gdpr_consents")
      .select("data_storage_consent, consented_at")
      .eq("member_id", params.id)
      .maybeSingle(),
  ]);

  const viewer = await getCurrentMember();
  // Never the viewer's own row (their own password lives on /account), and
  // staff rows only for the owner — mirrors the API checks.
  const canManageAccess =
    viewer !== null &&
    viewer.memberId !== member.id &&
    (member.role === "athlete" || viewer.role === "gym_owner");

  return (
    <MemberProfileClient
      member={member}
      latestInvite={invite ?? null}
      consent={consent ?? null}
      canManageAccess={canManageAccess}
      viewerIsOwner={viewer?.role === "gym_owner"}
    />
  );
}
