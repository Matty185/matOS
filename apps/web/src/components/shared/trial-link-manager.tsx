"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Flow audit 9.1: the owner's public trial link (Settings). The code is
// generated server-side; changing it kills the old link.
export function TrialLinkManager({ gymId }: { gymId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const {
    data: code,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trial-code", gymId],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("gyms")
        .select("trial_code")
        .eq("id", gymId)
        .single();
      if (error) throw error;
      return data.trial_code;
    },
  });
  const url =
    code && typeof window !== "undefined" ? `${window.location.origin}/trial/${code}` : null;

  async function act(action: "enable" | "regenerate" | "disable") {
    setBusy(true);
    try {
      const res = await fetch("/api/gym/trial-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't change the trial link.");
        return;
      }
      toast.success(
        action === "disable"
          ? "Trial link turned off."
          : action === "regenerate"
            ? "New trial link created. The old one no longer works."
            : "Trial link turned on.",
      );
      queryClient.invalidateQueries({ queryKey: ["trial-code", gymId] });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the link and copy it instead.");
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) {
    return <p className="text-sm text-destructive">Couldn&apos;t load the trial link.</p>;
  }

  if (!code) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Turn this on to get a public link people can use to ask for a free trial. Put it on your
          website, Instagram bio or a poster. Requests show up under Trials.
        </p>
        <Button className="h-11 w-fit" onClick={() => act("enable")} disabled={busy}>
          {busy ? "Turning on..." : "Turn on trial link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url ?? ""}
          aria-label="Trial link"
          className="h-11"
          onFocus={(e) => e.target.select()}
        />
        <Button variant="outline" className="h-11 shrink-0" onClick={copy}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {url ? (
        <div className="w-fit rounded-md border bg-white p-3">
          <QRCodeSVG value={url} size={160} level="M" marginSize={1} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="h-11" disabled={busy}>
              Change link
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create a new trial link?</AlertDialogTitle>
              <AlertDialogDescription>
                The current link stops working straight away, so update it on your website and
                posters. Useful if the link is getting spam.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={() => act("regenerate")}>
                Create new link
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="h-11" disabled={busy}>
              Turn off
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Turn off the trial link?</AlertDialogTitle>
              <AlertDialogDescription>
                The link stops working. Requests you already have stay under Trials. You can turn it
                on again later, with a new link.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={() => act("disable")}>
                Turn off
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
