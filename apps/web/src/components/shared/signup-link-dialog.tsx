"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { formatDistanceToNow } from "date-fns";
import { Check, Copy, Mail, MessageCircle, Plus, QrCode, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MintedLink = { id: string; url: string; expiresAt: string; gymName: string | null };

/**
 * Stage O7: a one-time sign-up link that isn't tied to anyone yet. Whoever
 * opens it fills in their own name, email and belt and joins as a member.
 * One link = one person; "Create another" for the next. The raw link is
 * only shown once (only its hash is stored), so the "waiting" list below
 * can cancel links but never re-show them.
 */
export function SignupLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [link, setLink] = useState<MintedLink | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open) {
      setLink(null);
      setShowQr(false);
      setCopied(null);
    }
  }, [open]);

  const { data: pending } = useQuery({
    queryKey: ["signup-links", "pending"],
    enabled: open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("signup_links")
        .select("id, created_at, expires_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function createLink() {
    setCreating(true);
    try {
      const res = await fetch("/api/signup-links", { method: "POST" });
      const body = await res.json();
      if (!openRef.current) return;
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't create a sign-up link.");
        return;
      }
      setLink(body as MintedLink);
      setShowQr(false);
      setCopied(null);
      void queryClient.invalidateQueries({ queryKey: ["signup-links"] });
    } catch {
      toast.error("Couldn't create a sign-up link — check your connection.");
    } finally {
      setCreating(false);
    }
  }

  async function cancelLink(id: string) {
    setCancelling(id);
    try {
      const res = await fetch(`/api/signup-links/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't cancel that link.");
        return;
      }
      if (link?.id === id) setLink(null);
      toast.success("Link cancelled — it won't work any more.");
      void queryClient.invalidateQueries({ queryKey: ["signup-links"] });
    } catch {
      toast.error("Couldn't cancel that link — check your connection.");
    } finally {
      setCancelling(null);
    }
  }

  async function copy(text: string, which: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  const gymName = link?.gymName ?? "the gym";
  const message = link
    ? `Hi! Here's your link to join ${gymName} on MatOS — fill in your details and pick a password (works once, for 7 days): ${link.url}`
    : "";
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const otherPending = (pending ?? []).filter((p) => p.id !== link?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign-up link</DialogTitle>
          <DialogDescription>
            Send a link and the person fills in their own name, email and belt. Each link signs up
            one person, once, within 7 days.
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <Button className="h-11" onClick={createLink} disabled={creating}>
            {creating ? "Creating link..." : "Create sign-up link"}
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Input
                readOnly
                value={link.url}
                aria-label="Sign-up link"
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
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <a
                  href={`mailto:?subject=${encodeURIComponent(
                    `Join ${gymName} on MatOS`,
                  )}&body=${encodeURIComponent(message)}`}
                >
                  <Mail className="mr-2 h-4 w-4" /> Email
                </a>
              </Button>
              <Button variant="outline" className="h-11" onClick={() => copy(message, "message")}>
                {copied === "message" ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                Copy message
              </Button>
              {canNativeShare ? (
                <Button
                  variant="outline"
                  className="col-span-2 h-11"
                  onClick={() =>
                    navigator
                      .share({ title: `Join ${gymName} on MatOS`, text: message })
                      .catch(() => {})
                  }
                >
                  <Share2 className="mr-2 h-4 w-4" /> More options
                </Button>
              ) : null}
            </div>

            {showQr ? (
              <div className="flex flex-col items-center gap-2 rounded-md border bg-white p-4">
                {/* Rendered locally — the link never goes to a QR service. */}
                <QRCodeSVG value={link.url} size={208} level="M" marginSize={1} />
                <p className="text-center text-xs text-neutral-600">
                  Scan with a phone camera. Works for one person only.
                </p>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              Whoever opens this first becomes a member, so send it to one person only.
            </p>

            <Button variant="outline" className="h-11" onClick={createLink} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              {creating ? "Creating link..." : "Create another link"}
            </Button>
          </div>
        )}

        {otherPending.length > 0 ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <p className="text-sm font-medium">
              {otherPending.length} unused link{otherPending.length === 1 ? "" : "s"}
            </p>
            <ul className="flex flex-col gap-1">
              {otherPending.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Made {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </span>
                  <Button
                    variant="ghost"
                    className="h-11"
                    disabled={cancelling === p.id}
                    onClick={() => cancelLink(p.id)}
                  >
                    {cancelling === p.id ? "Cancelling..." : "Cancel"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
