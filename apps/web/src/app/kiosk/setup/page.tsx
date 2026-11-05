"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Flow audit 4.4: opened on the tablet from the owner's one-time setup link
 * (/kiosk/setup#<secret>). The secret lives in the URL fragment, which the
 * browser never sends to the server; it is posted once to /api/kiosk/activate,
 * which sets the device cookie. The fragment is then stripped from history.
 */
export default function KioskSetupPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The link is single use: never post it twice (React StrictMode runs
    // effects twice in development).
    if (started.current) return;
    started.current = true;

    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/kiosk/setup");
    if (!token) {
      setError("This setup link is incomplete. Open the full link from the academy owner.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/kiosk/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          router.replace("/kiosk");
        } else {
          setError(body.error ?? "Couldn't set up this tablet.");
        }
      } catch {
        setError(
          "Couldn't reach MatOS — check the tablet's internet connection and open the link again.",
        );
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col gap-3 text-center">
        <h1 className="font-heading text-4xl tracking-wide">Kiosk setup</h1>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground">Setting up this tablet...</p>
        )}
      </div>
    </main>
  );
}
