import { UserCog } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Edit contact, change password, request my data (GDPR export), request
// account deletion — all land in Stage 8.
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Account</h1>
      <EmptyState
        icon={UserCog}
        title="Account settings coming soon"
        description="Contact details, password, and your data & privacy options will live here."
      />
    </div>
  );
}
