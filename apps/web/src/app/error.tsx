"use client";

import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// CLAUDE.md UI Standards: "fallback error page for the unhandled." Next.js
// routes any thrown error (Server or Client Component) here — the RSC
// dashboard query and every client-side query's unhandled rejection both
// land on this one boundary.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[unhandled]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide text-primary">
            Something went wrong
          </CardTitle>
          <CardDescription>
            This page hit an unexpected error. Try again, or come back in a moment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11 w-full" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
