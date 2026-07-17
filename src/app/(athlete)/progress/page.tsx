import { TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// Attendance history, belt timeline, and personal logs (working
// on/struggling with) land in Stages 4-5.
export default function ProgressPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">My Progress</h1>
      <EmptyState
        icon={TrendingUp}
        title="Nothing tracked yet"
        description="Your attendance history, belt timeline, and training logs will show up here."
      />
    </div>
  );
}
