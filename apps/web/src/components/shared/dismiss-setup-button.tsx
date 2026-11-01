"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Stage O4: hide the dashboard setup checklist for good (plan §3.3). */
export function DismissSetupButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function dismiss() {
    setPending(true);
    try {
      const res = await fetch("/api/gym/onboarding", { method: "POST" });
      if (!res.ok) {
        toast.error("Couldn't dismiss — try again.");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Couldn't dismiss — check your connection.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="ghost" className="h-11" onClick={dismiss} disabled={pending}>
      {pending ? "Hiding..." : "I'm all set — hide this"}
    </Button>
  );
}
