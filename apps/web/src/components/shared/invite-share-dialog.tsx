"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Mail, MessageCircle, QrCode, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InviteShareMember = {
  id: string;
  first_name: string;
  email: string;
  phone: string | null;
};

type InviteLink = { url: string; expiresAt: string; gymName: string };

/**
 * Stage O2: the coach-side half of onboarding without a verified email
 * domain. Mints a single-use claim link (POST /api/invite, delivery "link")
 * and offers every way a BJJ coach actually reaches members: show a QR to
 * scan on the mat, WhatsApp, text, their *own* email app (mailto — sent
 * from the coach's address, so no sending domain needed), the OS share
 * sheet, or plain copy.
 *
 * Minting invalidates the previous unclaimed link (the raw token is never
 * stored, so it can't be re-shown). So when a still-valid invite already
 * exists, nothing is minted until the coach explicitly asks — reopening the
 * dialog must never silently kill a link they already sent.
 */
export function InviteShareDialog({
  member,
  open,
  onOpenChange,
  hasActiveInvite,
  onInviteCreated,
}: {
  member: InviteShareMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasActiveInvite: boolean;
  onInviteCreated?: () => void;
}) {
  const [link, setLink] = useState<InviteLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [showQr, setShowQr] = useState(false);
  // Each mint invalidates the previous link, so: auto-mint at most once per
  // open (survives React StrictMode's double effect), and only apply the
  // newest request's response (a late reply after close/reopen is dropped).
  const autoMinted = useRef(false);
  const requestId = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  const createLink = useCallback(async () => {
    const id = ++requestId.current;
    setCreating(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: member.id, delivery: "link" }),
      });
      const body = await res.json();
      if (id !== requestId.current || !openRef.current) return;
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't create an invite link.");
        return;
      }
      setLink({ url: body.claimUrl, expiresAt: body.expiresAt, gymName: body.gymName });
      onInviteCreated?.();
    } catch {
      if (id === requestId.current) {
        toast.error("Couldn't create an invite link — check your connection.");
      }
    } finally {
      if (id === requestId.current) setCreating(false);
    }
  }, [member.id, onInviteCreated]);

  useEffect(() => {
    if (!open) {
      autoMinted.current = false;
      requestId.current++;
      setLink(null);
      setShowQr(false);
      setCopied(null);
      setCreating(false);
      return;
    }
    if (!hasActiveInvite && !autoMinted.current) {
      autoMinted.current = true;
      void createLink();
    }
    // Only on open — createLink identity changes shouldn't re-mint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const message = link
    ? `Hi ${member.first_name}, ${link.gymName} is now using MatOS for check-ins and progress tracking. Set up your account here (link works once, for 7 days): ${link.url}`
    : "";

  async function copy(text: string, which: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `Join ${link?.gymName} on MatOS`, text: message });
    } catch {
      // Dismissing the share sheet throws AbortError — not an error to show.
    }
  }

  const phoneDigits = internationalDigits(member.phone);
  const whatsappHref = `https://wa.me/${phoneDigits ?? ""}?text=${encodeURIComponent(message)}`;
  // Phone is free text — keep only + and digits so it can't smuggle extra
  // URI parameters into the sms: link.
  const smsNumber = member.phone?.replace(/[^\d+]/g, "") ?? "";
  const smsHref =
    smsNumber.length >= 6 ? `sms:${smsNumber}?&body=${encodeURIComponent(message)}` : null;
  const mailHref = `mailto:${encodeURIComponent(member.email)}?subject=${encodeURIComponent(
    `Join ${link?.gymName ?? "the gym"} on MatOS`,
  )}&body=${encodeURIComponent(message)}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite {member.first_name}</DialogTitle>
          <DialogDescription>
            Send {member.first_name} their personal sign-up link. It works once and expires in 7
            days.
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          creating ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Creating link...</p>
          ) : hasActiveInvite ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {member.first_name} already has a link that hasn&apos;t been used. Making a new one
                stops the old one working — do this if it was lost or never arrived.
              </p>
              <Button className="h-11" onClick={createLink}>
                <RefreshCw className="mr-2 h-4 w-4" /> Create a new link
              </Button>
            </div>
          ) : (
            <Button className="h-11" onClick={createLink}>
              Try again
            </Button>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={link.url}
                aria-label="Invite link"
                className="h-11 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                className="h-11 shrink-0"
                onClick={() => copy(link.url, "link")}
                aria-label="Copy link"
              >
                {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setShowQr((v) => !v)}
                aria-expanded={showQr}
              >
                <QrCode className="mr-2 h-4 w-4" /> {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a href={mailHref}>
                  <Mail className="mr-2 h-4 w-4" /> Email
                </a>
              </Button>
              {smsHref ? (
                <Button asChild variant="outline" className="h-11">
                  <a href={smsHref}>
                    <MessageCircle className="mr-2 h-4 w-4" /> Text
                  </a>
                </Button>
              ) : (
                <Button variant="outline" className="h-11" onClick={() => copy(message, "message")}>
                  {copied === "message" ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Copy className="mr-2 h-4 w-4" />
                  )}
                  Copy message
                </Button>
              )}
              {canNativeShare ? (
                <Button variant="outline" className="col-span-2 h-11" onClick={nativeShare}>
                  <Share2 className="mr-2 h-4 w-4" /> More options
                </Button>
              ) : null}
            </div>

            {showQr ? (
              <div className="flex flex-col items-center gap-2 rounded-md border bg-white p-4">
                {/* Rendered locally — the link never goes to a QR service. */}
                <QRCodeSVG value={link.url} size={208} level="M" marginSize={1} />
                <p className="text-center text-xs text-neutral-600">
                  {member.first_name} scans this with their phone camera.
                </p>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Treat this link like a password — whoever opens it first sets up the account. Only
              send it to {member.first_name}.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * wa.me needs a full international number with no "+". Only trust numbers
 * already written internationally ("+353 87…" / "00353…"); a local
 * "087…" can't be safely guessed, so WhatsApp opens its contact picker
 * with the message prefilled instead.
 */
function internationalDigits(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\D/g, "") || null;
  if (trimmed.startsWith("00")) return trimmed.slice(2).replace(/\D/g, "") || null;
  return null;
}
