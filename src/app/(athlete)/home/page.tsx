import { CalendarDays } from "lucide-react";
import { getCurrentMember } from "@/lib/auth/current-member";
import { EmptyState } from "@/components/shared/empty-state";

// BeltDisplay, attendance streak, upcoming classes land in Stages 4-5 once
// real belt/attendance/class data exists to show.
export default async function AthleteHomePage() {
  const member = await getCurrentMember();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">
        Welcome{member ? `, ${member.firstName}` : ""}
      </h1>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Upcoming classes</h2>
        <EmptyState
          icon={CalendarDays}
          title="No classes scheduled yet"
          description="Your gym's schedule will show up here once it's set up."
        />
      </div>
    </div>
  );
}
