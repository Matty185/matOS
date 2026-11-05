import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Stage S2 (matos_mobile_plan.md §1 "Locked product decisions" — "Solo
// user sees gym features Teasers... a deliberate growth mechanic"). A
// static marketing surface, not a functional workflow: a solo user has no
// gym to invite a coach *into*, so this points them at sharing MatOS
// generally rather than a targeted in-app invite (which only coaches can
// send, to a specific member, in a specific gym).
export function GymTeaser() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 py-4">
        <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Your academy isn&apos;t on MatOS yet</p>
          <p className="text-sm text-muted-foreground">
            Tell your coach about MatOS — once your academy signs up, they can invite you and your
            workspace stays exactly as it is.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
