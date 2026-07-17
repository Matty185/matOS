import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Recurring class CRUD lands in Stage 5.
export default function ClassesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Classes</h1>
      <EmptyState
        icon={CalendarDays}
        title="No classes yet"
        description="Build your weekly schedule — gi, no-gi, comp, and open mat classes all live here."
        actionLabel="Add a class"
      />
    </div>
  );
}
