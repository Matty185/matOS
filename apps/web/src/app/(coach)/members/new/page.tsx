import { MemberForm } from "@/components/shared/member-form";

export default function NewMemberPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Add Member</h1>
      <MemberForm mode="create" />
    </div>
  );
}
