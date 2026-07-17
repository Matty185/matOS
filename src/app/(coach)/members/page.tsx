import { Users } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Real list/search/filter + add-member flow lands in Stage 4.
export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Members</h1>
      <EmptyState
        icon={Users}
        title="No members yet"
        description="Add your first member to get started — they'll get an invite email automatically."
        actionLabel="Add member"
      />
    </div>
  );
}
