"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, PartyPopper } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { RosterImporter } from "@/components/shared/roster-importer";
import { Button } from "@/components/ui/button";

export default function ImportMembersPage() {
  const queryClient = useQueryClient();
  const [imported, setImported] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/members"
        className="-my-3 flex items-center gap-1 self-start py-3 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to members
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl tracking-wide">Import Members</h1>
        <p className="text-sm text-muted-foreground">
          Bring your whole roster in at once, with everyone&apos;s current belt.
        </p>
      </div>

      {imported === null ? (
        <RosterImporter
          onImported={(count) => {
            setImported(count);
            void queryClient.invalidateQueries({ queryKey: ["members"] });
          }}
        />
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border p-8 text-center">
          <PartyPopper className="h-10 w-10 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-lg font-medium">
              {imported} member{imported === 1 ? "" : "s"} added
            </p>
            <p className="text-sm text-muted-foreground">
              Next, send them their sign-up links so they can check in and track progress.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild className="h-11">
              <Link href="/members?invite=not_invited">Send invites</Link>
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setImported(null)}>
              Import more
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
