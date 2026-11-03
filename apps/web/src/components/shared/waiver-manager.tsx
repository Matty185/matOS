"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentWaiver } from "@/lib/waivers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MAX = 20000;

// Flow audit 9.3: the owner writes the gym's liability waiver. Each publish
// is a new, unchangeable version; members are asked to sign the newest one.
export function WaiverManager() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    data: current,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["waiver-current"],
    queryFn: () => fetchCurrentWaiver(createClient()),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const text = draft ?? current?.body ?? "";
  const trimmed = text.trim();
  const unchanged = !!current && trimmed === current.body.trim();
  const tooShort = trimmed.length < 20;

  async function publish() {
    setSaving(true);
    try {
      const res = await fetch("/api/waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't publish the waiver.");
        return;
      }
      toast.success(`Waiver version ${body.version} published.`);
      setDraft(null);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["waiver-current"] });
      queryClient.invalidateQueries({ queryKey: ["waiver-status"] });
      router.refresh(); // dashboard count is server-rendered
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) {
    return (
      <p className="text-sm text-destructive">Couldn&apos;t load the waiver. Try refreshing.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {current
          ? `Version ${current.version}, published ${new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(current.created_at))}. Members sign it from their Home page; coaches can record paper or parent signatures on a member's profile.`
          : "No waiver yet. Once you publish one, members are asked to sign it and anyone who hasn't is flagged for coaches. Nobody is stopped from checking in."}
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="waiver-body">{current ? "Waiver text" : "Write your waiver"}</Label>
        <Textarea
          id="waiver-body"
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          maxLength={MAX}
          placeholder="I understand that Brazilian jiu-jitsu is a contact sport and carries a risk of injury..."
        />
        <p className="text-xs text-muted-foreground">
          Don&apos;t ask for medical details here. {trimmed.length.toLocaleString()} /{" "}
          {MAX.toLocaleString()} characters.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="h-11"
          disabled={unchanged || tooShort || saving}
          onClick={() => setConfirmOpen(true)}
        >
          {current ? "Publish new version" : "Publish waiver"}
        </Button>
        {draft !== null && !unchanged ? (
          <Button variant="outline" className="h-11" onClick={() => setDraft(null)}>
            Discard changes
          </Button>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current ? `Publish version ${current.version + 1}?` : "Publish the waiver?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {current
                ? "Everyone who signed the old version will be asked to sign again. Published versions can't be edited."
                : "Every athlete will be asked to sign it. Published versions can't be edited; to change it later you publish a new version."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={(e) => {
                e.preventDefault();
                void publish();
              }}
              disabled={saving}
            >
              {saving ? "Publishing..." : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
