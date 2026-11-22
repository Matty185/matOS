"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

/** Re-runs the page: once approved, it sends them into MatOS. */
export function CheckAgainButton() {
  const router = useRouter();
  const [checking, startTransition] = useTransition();
  return (
    <Button
      className="h-11 w-fit"
      disabled={checking}
      onClick={() => startTransition(() => router.refresh())}
    >
      {checking ? "Checking..." : "Check again"}
    </Button>
  );
}
