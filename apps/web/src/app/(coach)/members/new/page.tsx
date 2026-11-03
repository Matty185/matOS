import { MemberForm } from "@/components/shared/member-form";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Flow audit 9.1: ?lead=<id> ("Add as member" on a trial request) pre-fills
// the form from the lead (RLS: staff of the lead's gym only) and marks it
// converted once the member is created.
export default async function NewMemberPage({ searchParams }: { searchParams: { lead?: string } }) {
  let lead: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    for_child: boolean;
    parent_name: string | null;
  } | null = null;
  if (searchParams.lead && UUID_RE.test(searchParams.lead)) {
    const { data } = await createClient()
      .from("trial_leads")
      .select("id, first_name, last_name, email, phone, status, for_child, parent_name")
      .eq("id", searchParams.lead)
      .maybeSingle();
    if (data && data.status !== "converted") lead = data;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Add Member</h1>
      {lead ? (
        <p className="text-sm text-muted-foreground">
          From {lead.first_name}&apos;s trial request. Check the details, then add them.
          {lead.for_child
            ? ` It was made by their parent or guardian (${lead.parent_name ?? "unknown"}${lead.email ? `, ${lead.email}` : ""}), whose details are filled in as the parent contact. Leave the email blank unless ${lead.first_name} should have their own login.`
            : ""}
        </p>
      ) : null}
      <MemberForm
        mode="create"
        leadId={lead?.id}
        prefill={
          lead
            ? lead.for_child
              ? {
                  // A child: the contact details are the parent's, so they go
                  // in the parent/emergency fields, not the child's login.
                  first_name: lead.first_name,
                  last_name: lead.last_name,
                  email: "",
                  emergency_contact_name: lead.parent_name ?? "",
                  emergency_contact_phone: lead.phone ?? "",
                }
              : {
                  first_name: lead.first_name,
                  last_name: lead.last_name,
                  email: lead.email ?? "",
                  phone: lead.phone ?? "",
                }
            : undefined
        }
      />
    </div>
  );
}
