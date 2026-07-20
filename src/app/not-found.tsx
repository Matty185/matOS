import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// CLAUDE.md UI Standards: "fallback error page for the unhandled." Next.js
// renders this for any unmatched route and for every explicit notFound()
// call (member/[id], invite/[token]) — without it those fall back to
// Next.js's generic unstyled 404, the one gap error.tsx doesn't cover since
// a 404 isn't a thrown error.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide text-primary">
            Page not found
          </CardTitle>
          <CardDescription>
            This page doesn&apos;t exist, or you don&apos;t have access to it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="h-11 w-full" asChild>
            <Link href="/">Back to MatOS</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
