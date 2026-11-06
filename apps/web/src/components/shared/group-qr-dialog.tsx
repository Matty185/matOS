"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type GroupLink = {
  id: string;
  url: string;
  expiresAt: string;
  maxUses: number;
  gymName: string | null;
};

/**
 * A printed QR code several people can use at a class. The raw link is only
 * returned once, so it stays in state while the page is open. If it's lost,
 * cancel it from the sign-up link list and make a new one.
 */
export function GroupQrDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [link, setLink] = useState<GroupLink | null>(null);
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/signup-links/shared", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't create the QR code.");
        return;
      }
      setLink(body as GroupLink);
      void queryClient.invalidateQueries({ queryKey: ["signup-links"] });
    } catch {
      toast.error("Couldn't create the QR code — check your connection.");
    } finally {
      setCreating(false);
    }
  }

  const until = link ? format(new Date(link.expiresAt), "EEEE d MMMM, HH:mm") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="invite-sheet-dialog max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="print:hidden">
          <DialogTitle>Group QR code</DialogTitle>
          <DialogDescription>
            One code for a whole class. Anyone who scans it can sign up with their own details, for
            24 hours or up to 60 sign-ups. Don&apos;t post it online, and check the members list
            afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="invite-sheet-wrap flex flex-col gap-4">
          {!link ? (
            <Button className="h-11" onClick={create} disabled={creating}>
              {creating ? "Creating..." : "Create group QR code"}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-4 print:hidden">
              <div className="rounded-md border bg-white p-4">
                {/* Rendered locally — the link never goes to a QR service. */}
                <QRCodeSVG value={link.url} size={240} level="M" marginSize={1} />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Works until {until}, for up to {link.maxUses} people. To stop it early, cancel it
                from the sign-up link list.
              </p>
              <Button className="h-11 w-full" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
            </div>
          )}

          {link ? (
            /* Print-only poster — see the .invite-sheet print rules in globals.css. */
            <div className="invite-sheet hidden flex-col items-center gap-8 pt-12 text-center text-black print:flex">
              <p className="text-5xl font-bold">{link.gymName ?? "Your academy"}</p>
              <p className="text-3xl">Scan to join on MatOS</p>
              <QRCodeSVG value={link.url} size={440} level="M" marginSize={1} />
              <p className="text-2xl">Use your phone camera, then fill in your own details.</p>
              <p className="text-xl">Children and parents: please ask a coach.</p>
              <p className="text-lg">Works until {until}.</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
