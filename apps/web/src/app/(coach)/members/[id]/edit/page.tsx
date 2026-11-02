import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberForm } from "@/components/shared/member-form";

export default async function EditMemberPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: member } = await supabase
    .from("members")
    .select(
      "first_name, last_name, email, user_id, phone, emergency_contact_name, emergency_contact_phone, membership_plan, notes",
    )
    .eq("id", params.id)
    .single();

  if (!member) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Edit Member</h1>
      <MemberForm
        mode="edit"
        memberId={params.id}
        emailLocked={Boolean(member.user_id)}
        defaultValues={{
          email: member.email ?? "",
          first_name: member.first_name,
          last_name: member.last_name,
          phone: member.phone ?? "",
          emergency_contact_name: member.emergency_contact_name ?? "",
          emergency_contact_phone: member.emergency_contact_phone ?? "",
          membership_plan: member.membership_plan,
          notes: member.notes ?? "",
        }}
      />
    </div>
  );
}
