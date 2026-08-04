"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ShareDialogProps = {
  type: "profile" | "breakdown";
  subjectId: string;
};

// Stage S3 (matos_mobile_plan.md §2.4): every share link is created fresh
// on demand, not reused across opens — simpler than a "your existing link
// for this subject" lookup, and matches share_links having no unique
// constraint on (type, subject_id, created_by) forcing one-per-subject.
// A user who shares the same profile twice just gets two independently
// revocable links, which is fine (revoking one doesn't kill the other).
export function ShareDialog({ type, subjectId }: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [redactOpponents, setRedactOpponents] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject_id: subjectId, redact_opponents: redactOpponents }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }
      setShareUrl(`${window.location.origin}/share/${body.token}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset for the next open — each open should generate a fresh
      // link rather than showing a stale one from a prior session.
      setShareUrl(null);
      setCopied(false);
      setRedactOpponents(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11">
          <Share2 className="mr-2 h-4 w-4" /> Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {type === "profile" ? "profile" : "breakdown"}</DialogTitle>
          <DialogDescription>
            Anyone with this link can view a read-only public page. You can revoke it any time from
            your share links list.
          </DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="h-11"
                onFocus={(e) => e.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="redact_opponents"
                checked={redactOpponents}
                onCheckedChange={(c) => setRedactOpponents(c === true)}
                className="mt-0.5"
              />
              <Label htmlFor="redact_opponents" className="text-sm font-normal leading-snug">
                Hide training partners&apos; real names on the public page (recommended)
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" disabled={generating} className="h-11" onClick={handleGenerate}>
                {generating ? "Generating..." : "Generate link"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
