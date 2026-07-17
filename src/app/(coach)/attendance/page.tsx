import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Today's classes + manual marking + realtime check-ins lands in Stage 5.
export default function AttendancePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Attendance</h1>
      <EmptyState
        icon={CalendarCheck}
        title="No classes scheduled"
        description="Set up your weekly class schedule to start tracking attendance."
        actionLabel="Add a class"
      />
    </div>
  );
}
