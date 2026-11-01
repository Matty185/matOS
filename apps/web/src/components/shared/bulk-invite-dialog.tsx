"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BulkLink = { memberId: string; name: string; claimUrl: string };

/**
 * Stage O4: invite a whole class at once without email. Mints one link per
 * selected member and lays them out as a printable sheet of named QR cards
 * — cut them up and hand them out on the mat, or send each one
 * individually. Deliberately no "copy all": pasting every link into a
 * group chat would let anyone claim anyone's account.
 */
export function BulkInviteDialog({
  memberIds,
  open,
  onOpenChange,
  onDone,
}: {
  memberIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [links, setLinks] = useState<BulkLink[] | null>(null);
  const [gymName, setGymName] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLinks(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/invite/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_ids: memberIds }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Couldn't create invite links.");
          return;
        }
        setLinks(body.links);
        setGymName(body.gymName);
        setSkipped(body.skipped);
        onDone();
      } catch {
        if (!cancelled) setError("Couldn't create invite links — check your connection.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mint once per open — re-running would invalidate the links just shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copy(link: BulkLink) {
    try {
      await navigator.clipboard.writeText(link.claimUrl);
      setCopiedId(link.memberId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Couldn't copy the link.");
    }
  }

  const message = (link: BulkLink) =>
    `Hi ${link.name.split(" ")[0]}, ${gymName} is now using MatOS. Set up your account here (works once, for 7 days): ${link.claimUrl}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The raw links exist only here (tokens are never stored), so an
        // Esc/X close after they're made needs a confirm.
        if (
          !next &&
          links &&
          links.length > 0 &&
          !window.confirm(
            "Close the invite links? You'll need to make new links (cancelling these) to see them again.",
          )
        ) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="invite-sheet-dialog max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="print:hidden">
          <DialogTitle>Invite links</DialogTitle>
          <DialogDescription>
            Each link is personal, works once and lasts 7 days. Print the sheet to hand out, or send
            each one individually.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !links ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Creating links...</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody selected needs an invite — they&apos;ve either joined already or are inactive.
          </p>
        ) : (
          <div className="invite-sheet-wrap flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <p className="text-sm text-muted-foreground">
                {links.length} link{links.length === 1 ? "" : "s"} ready
                {skipped > 0 ? ` · ${skipped} skipped (already joined or inactive)` : ""}
              </p>
              <div className="flex gap-2">
                <Button className="h-11" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print sheet
                </Button>
                <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>

            <ul className="flex flex-col divide-y rounded-md border print:hidden">
              {links.map((link) => (
                <li key={link.memberId} className="flex items-center justify-between gap-2 p-2">
                  <span className="min-w-0 truncate text-sm font-medium">{link.name}</span>
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      onClick={() => copy(link)}
                      aria-label={`Copy ${link.name}'s link`}
                    >
                      {copiedId === link.memberId ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="h-11 w-11">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(message(link))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Send ${link.name}'s link on WhatsApp`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>

            {/* Print-only sheet — see the .invite-sheet print rules in globals.css. */}
            <div className="invite-sheet hidden print:grid print:grid-cols-3 print:gap-4">
              {links.map((link) => (
                <div
                  key={link.memberId}
                  className="flex break-inside-avoid flex-col items-center gap-2 border border-dashed border-neutral-400 p-3 text-center text-black"
                >
                  <p className="text-sm font-semibold">{link.name}</p>
                  <QRCodeSVG value={link.claimUrl} size={128} level="M" marginSize={1} />
                  <p className="text-[10px] leading-tight">
                    Scan with your phone camera to join {gymName} on MatOS. Personal link — works
                    once.
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
