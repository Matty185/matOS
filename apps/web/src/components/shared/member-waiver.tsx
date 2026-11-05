"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentWaiver, needsWaiver, WAIVER_METHOD_LABELS } from "@/lib/waivers";
import { WaiverText } from "@/components/shared/waiver-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

// Flow audit 9.3: a member's waiver status on their profile (staff page).
// Coaches can record a paper waiver, let a parent/guardian sign on this
// device, or void a record made in error.
export function MemberWaiver({
  memberId,
  memberName,
  active,
  role,
  hasLogin,
}: {
  memberId: string;
  memberName: string;
  active: boolean;
  role: string;
  /** False for roster-only members (no account), who can't sign themselves. */
  hasLogin: boolean;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"paper" | "guardian" | null>(null);
  const [voiding, setVoiding] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["member-waiver", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const waiver = await fetchCurrentWaiver(supabase);
      if (!waiver) return { waiver: null, signature: null };
      const { data: sig, error: sigError } = await supabase
        .from("waiver_signatures")
        .select("id, method, signer_name, signed_at")
        .eq("member_id", memberId)
        .eq("waiver_version_id", waiver.id)
        .is("voided_at", null)
        .maybeSingle();
      if (sigError) throw sigError;
      return { waiver, signature: sig };
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["member-waiver", memberId] });
    queryClient.invalidateQueries({ queryKey: ["waiver-status"] });
  }

  async function voidSignature(id: string) {
    setVoiding(true);
    try {
      const res = await fetch(`/api/waiver-signatures/${id}/void`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't void the signature.");
        return;
      }
      toast.success("Signature voided.");
      refresh();
    } finally {
      setVoiding(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading waiver...</p>;
  if (error || !data) {
    return <p className="text-sm text-destructive">Couldn&apos;t load the waiver status.</p>;
  }
  if (!data.waiver) {
    return (
      <p className="text-sm text-muted-foreground">
        No waiver yet. The owner can add one in Settings.
      </p>
    );
  }
  const exempt = !needsWaiver({ role });
  const sig = data.signature;

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4" aria-labelledby="waiver-heading">
      <div className="flex flex-wrap items-center gap-2">
        <FileSignature className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h2 id="waiver-heading" className="font-medium">
          Waiver
        </h2>
        {sig ? (
          <Badge>Signed</Badge>
        ) : exempt ? (
          <Badge variant="outline">Not needed</Badge>
        ) : (
          <Badge variant="warning">Not signed</Badge>
        )}
      </div>
      {sig ? (
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            {WAIVER_METHOD_LABELS[sig.method]}
            {sig.signer_name ? ` (${sig.signer_name})` : ""}, {fmt(sig.signed_at)} · version{" "}
            {data.waiver.version}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-11 w-fit" disabled={voiding}>
                Void
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void this signature?</AlertDialogTitle>
                <AlertDialogDescription>
                  Only for a record made in error (wrong member, or not actually signed). It stays
                  in the history as voided, and {memberName.split(" ")[0]} will be asked to sign
                  again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction className="h-11" onClick={() => voidSignature(sig.id)}>
                  Void signature
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {exempt
              ? "Coaches and owners don't need to sign the waiver."
              : `${memberName.split(" ")[0]} hasn't signed version ${data.waiver.version} yet. ${hasLogin ? "They can sign from their Home page, or record it here." : "They don't have a login, so record it here."}`}
          </p>
          {active && !exempt ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="h-11" onClick={() => setMode("guardian")}>
                Parent or guardian signs now
              </Button>
              <Button variant="outline" className="h-11" onClick={() => setMode("paper")}>
                Record paper waiver
              </Button>
            </div>
          ) : null}
        </>
      )}

      {mode ? (
        <RecordWaiverDialog
          mode={mode}
          memberId={memberId}
          memberName={memberName}
          waiver={data.waiver}
          onClose={() => setMode(null)}
          onSaved={() => {
            setMode(null);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function RecordWaiverDialog({
  mode,
  memberId,
  memberName,
  waiver,
  onClose,
  onSaved,
}: {
  mode: "paper" | "guardian";
  memberId: string;
  memberName: string;
  waiver: { id: string; version: number; body: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const guardian = mode === "guardian";
  const trimmedName = name.trim();
  // Paper: a name is optional, but if given it must be a real one.
  const nameOk = guardian ? trimmedName.length >= 2 : trimmedName.length !== 1;
  const canSave = nameOk && (!guardian || agree);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${memberId}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waiver_version_id: waiver.id,
          method: mode,
          signer_name: name.trim() || undefined,
          agree: guardian ? agree : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't save.");
        return;
      }
      toast.success(guardian ? "Waiver signed." : "Paper waiver recorded.");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {guardian ? `Waiver for ${memberName}` : `Paper waiver for ${memberName}`}
          </DialogTitle>
          <DialogDescription>
            {guardian
              ? "Hand this device to the parent or guardian. They read the waiver, type their own full name and tick the box."
              : `Record that ${memberName.split(" ")[0]} has a signed paper copy of version ${waiver.version} on file.`}
          </DialogDescription>
        </DialogHeader>
        {guardian ? <WaiverText body={waiver.body} version={waiver.version} /> : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="record-waiver-name">
            {guardian ? "Parent or guardian's full name" : "Name on the paper copy (optional)"}
          </Label>
          <Input
            id="record-waiver-name"
            className="h-11"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        {guardian ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id="record-waiver-agree"
              className="mt-0.5 h-5 w-5"
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
            />
            <Label htmlFor="record-waiver-agree" className="font-normal leading-snug">
              I am {memberName}&apos;s parent or guardian. I have read and agree to this waiver on
              their behalf.
            </Label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11" onClick={save} disabled={!canSave || saving}>
            {saving ? "Saving..." : guardian ? "Sign waiver" : "Record paper waiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
