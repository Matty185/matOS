import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Per-class self check-in (30-min-before window) lands in Stage 5.
export default function CheckInPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Check In</h1>
      <EmptyState
        icon={CalendarCheck}
        title="No classes today"
        description="When your gym schedules classes, you'll be able to check in here starting 30 minutes before each one."
      />
    </div>
  );
}
