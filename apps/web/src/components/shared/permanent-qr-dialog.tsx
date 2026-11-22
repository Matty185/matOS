"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type PermanentLink = {
  id: string;
  url: string;
  signups: number;
  createdAt: string;
  gymName: string | null;
};

/**
 * Owner only: the academy's permanent join QR code, for a poster on the wall.
 * It never expires. Everyone who signs up with it waits on the Members page
 * until a coach approves them. Shown and reprinted any time; "Replace" stops
 * the old code (for when a poster ends up somewhere it shouldn't).
 */
export function PermanentQrDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"create" | "replace" | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["signup-links", "permanent"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/signup-links/permanent");
      if (!res.ok) throw new Error("load failed");
      return ((await res.json()) as { link: PermanentLink | null }).link;
    },
  });

  async function create() {
    const res = await fetch("/api/signup-links/permanent", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Couldn't create the join code.");
    queryClient.setQueryData(["signup-links", "permanent"], body.link as PermanentLink);
    void queryClient.invalidateQueries({ queryKey: ["signup-links", "pending"] });
  }

  async function handleCreate() {
    setBusy("create");
    try {
      await create();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the join code.");
    } finally {
      setBusy(null);
    }
  }

  async function handleReplace() {
    if (!data) return;
    setBusy("replace");
    try {
      const res = await fetch(`/api/signup-links/${data.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't replace the code.");
      }
      await create();
      toast.success("New code made. The old poster no longer works, so print this one.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't replace the code.");
      void queryClient.invalidateQueries({ queryKey: ["signup-links", "permanent"] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="invite-sheet-dialog max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="print:hidden">
          <DialogTitle>Permanent join QR code</DialogTitle>
          <DialogDescription>
            For a poster at the academy. It never expires. Anyone who scans it can sign up, but they
            can&apos;t use MatOS until a coach approves them on the Members page.
          </DialogDescription>
        </DialogHeader>

        <div className="invite-sheet-wrap flex flex-col gap-4">
          {isPending ? (
            <p className="text-sm text-muted-foreground print:hidden">Loading...</p>
          ) : isError ? (
            <div className="flex flex-col gap-2 print:hidden">
              <p className="text-sm text-destructive">Couldn&apos;t load the code.</p>
              <Button variant="outline" className="h-11 w-fit" onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          ) : !data ? (
            <Button className="h-11" onClick={handleCreate} disabled={busy !== null}>
              {busy === "create" ? "Creating..." : "Create permanent QR code"}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-4 print:hidden">
              <div className="rounded-md border bg-white p-4">
                {/* Rendered locally — the link never goes to a QR service. */}
                <QRCodeSVG
                  value={data.url}
                  size={240}
                  level="M"
                  marginSize={1}
                  title="Join QR code"
                  aria-label="Join QR code"
                />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {data.signups === 0
                  ? "Nobody has signed up with it yet."
                  : `${data.signups} sign-up${data.signups === 1 ? "" : "s"} so far.`}{" "}
                Keep it at the academy: don&apos;t post it online.
              </p>
              <Button className="h-11 w-full" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print poster
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-11 w-full" disabled={busy !== null}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {busy === "replace" ? "Replacing..." : "Replace code"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Replace the join code?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The printed poster stops working straight away and you&apos;ll need to print
                      the new one. People already waiting for approval stay on the list. Do this if
                      the code has been shared somewhere it shouldn&apos;t be.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
                    <AlertDialogAction className="h-11" onClick={handleReplace}>
                      Replace
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          {data ? (
            /* Print-only poster — see the .invite-sheet print rules in globals.css. */
            <div className="invite-sheet hidden flex-col items-center gap-8 pt-12 text-center text-black print:flex">
              <p className="text-5xl font-bold">{data.gymName ?? "Your academy"}</p>
              <p className="text-3xl">Scan to join on MatOS</p>
              <QRCodeSVG value={data.url} size={440} level="M" marginSize={1} aria-hidden="true" />
              <p className="text-2xl">Use your phone camera, then fill in your own details.</p>
              <p className="text-xl">A coach will approve your account.</p>
              <p className="text-xl">Children and parents: please ask a coach.</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
