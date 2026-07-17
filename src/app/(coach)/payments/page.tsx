import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Gym-wide members x months grid lands in Stage 6.
export default function PaymentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Payments</h1>
      <EmptyState
        icon={CreditCard}
        title="No payment history yet"
        description="Once you have members, their monthly payment status will show up here."
      />
    </div>
  );
}
