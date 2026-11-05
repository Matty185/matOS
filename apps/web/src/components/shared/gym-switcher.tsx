"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GymMembership } from "@/lib/auth/current-member";

type GymSwitcherProps = {
  memberships: GymMembership[];
  triggerClassName?: string;
};

// Stage S2 (matos_mobile_plan.md §2.3): "UI gets a context switcher only
// when >1 membership exists" — renders nothing otherwise, so a
// single-membership user (the entire alpha population today) sees no
// change at all.
export function GymSwitcher({ memberships, triggerClassName }: GymSwitcherProps) {
  const [switching, setSwitching] = useState(false);

  if (memberships.length <= 1) return null;

  const current = memberships.find((m) => m.isCurrent);

  async function handleSwitch(gymId: string) {
    if (switching || gymId === current?.gymId) return;
    setSwitching(true);

    const supabase = createClient();
    const { error } = await supabase.rpc("set_active_gym", { p_gym_id: gymId });

    if (error) {
      toast.error("Couldn't switch academies. Try again.");
      setSwitching(false);
      return;
    }

    // Switching gyms can change role, gym kind (personal vs real), and
    // therefore which shell/nav the user should even see — a full
    // navigation to "/" re-derives the correct destination server-side
    // (root page.tsx's redirect) rather than trying to patch client-side
    // layout state in place.
    window.location.href = "/";
  }

  return (
    <Select value={current?.gymId} onValueChange={handleSwitch} disabled={switching}>
      <SelectTrigger
        className={cn("h-11 w-full text-sm font-medium", triggerClassName)}
        aria-label="Switch active academy"
      >
        <SelectValue>{switching ? "Switching..." : current?.gymName}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {memberships.map((m) => (
          <SelectItem key={m.gymId} value={m.gymId}>
            <span className="flex items-center gap-2">
              {m.gymName}
              {m.isCurrent ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
