"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, MessageCircle, QrCode } from "lucide-react";
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

/**
 * Stage O2: a member who forgot their password asks the coach, who makes a
 * one-hour single-use reset link here. Nothing is minted until the coach
 * clicks — opening the dialog by accident shouldn't create a credential.
 */
export function PasswordResetLinkDialog({
  member,
  open,
  onOpenChange,
}: {
  member: { id: string; first_name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setUrl(null);
      setCopied(false);
      setShowQr(false);
    }
    onOpenChange(next);
  }

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch(`/api/members/${member.id}/reset-link`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't create a reset link.");
        return;
      }
      setUrl(body.url);
    } catch {
      toast.error("Couldn't create a reset link — check your connection.");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  const message = url
    ? `Hi ${member.first_name}, here's your MatOS password reset link (works once, for 1 hour): ${url}`
    : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset {member.first_name}&apos;s password</DialogTitle>
          <DialogDescription>
            For when {member.first_name} has forgotten their password. The link lets them choose a
            new one; it works once and expires in 1 hour.
          </DialogDescription>
        </DialogHeader>

        {!url ? (
          <Button className="h-11" onClick={createLink} disabled={creating}>
            {creating ? "Creating link..." : "Create reset link"}
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={url}
                aria-label="Password reset link"
                className="h-11 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                className="h-11 shrink-0"
                onClick={copy}
                aria-label="Copy link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={() => setShowQr((v) => !v)}>
                <QrCode className="mr-2 h-4 w-4" /> {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                </a>
              </Button>
            </div>
            {showQr ? (
              <div className="flex flex-col items-center gap-2 rounded-md border bg-white p-4">
                <QRCodeSVG value={url} size={208} level="M" marginSize={1} />
                <p className="text-center text-xs text-neutral-600">
                  {member.first_name} scans this with their phone camera.
                </p>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Only give this to {member.first_name} — it signs in as them.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
