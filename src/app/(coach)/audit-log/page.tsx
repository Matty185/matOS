import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Last 200 entries, filterable, plain-English actions — wired up as each
// module (Stages 4-8) starts actually writing audit_log rows.
export default function AuditLogPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Audit Log</h1>
      <EmptyState
        icon={ScrollText}
        title="No activity recorded yet"
        description="Every change made in MatOS — by you, your coaches, or the assistant — will be logged here."
      />
    </div>
  );
}
