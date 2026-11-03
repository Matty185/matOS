"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentWaiver } from "@/lib/waivers";
import { EmptyState } from "@/components/shared/empty-state";
import { WaiverText } from "@/components/shared/waiver-text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );

// Flow audit 9.3: the member reads the gym's current waiver and signs it
// (typed full name + tick). Signing is never required to check in; coaches
// just see who hasn't.
export default function WaiverPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-waiver"],
    queryFn: async () => {
      const supabase = createClient();
      const waiver = await fetchCurrentWaiver(supabase);
      if (!waiver) return { waiver: null, signedAt: null };
      // RLS: waiver_signatures_select_self.
      const { data: sig, error: sigError } = await supabase
        .from("waiver_signatures")
        .select("signed_at")
        .eq("waiver_version_id", waiver.id)
        .is("voided_at", null)
        .maybeSingle();
      if (sigError) throw sigError;
      return { waiver, signedAt: sig?.signed_at ?? null };
    },
  });

  async function sign() {
    if (!data?.waiver) return;
    setSaving(true);
    try {
      const res = await fetch("/api/waiver/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waiver_version_id: data.waiver.id, signer_name: name, agree }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't sign the waiver.");
        if (body.code === "WAIVER_OUTDATED" || body.code === "ALREADY_SIGNED") {
          queryClient.invalidateQueries({ queryKey: ["my-waiver"] });
        }
        return;
      }
      toast.success("Thanks, the waiver is signed.");
      queryClient.invalidateQueries({ queryKey: ["my-waiver"] });
      // Home is server-rendered; drop its cached copy so the prompt goes.
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const header = <h1 className="font-heading text-3xl tracking-wide">Waiver</h1>;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-destructive">Couldn&apos;t load the waiver. Try refreshing.</p>
      </div>
    );
  }
  if (!data.waiver) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          icon={FileSignature}
          title="No waiver to sign"
          description="Your gym hasn't published a waiver."
          actionLabel="Back to Home"
          actionHref="/home"
        />
      </div>
    );
  }

  const nameOk = name.trim().length >= 2;
  return (
    <div className="flex flex-col gap-6">
      {header}
      {data.signedAt ? (
        <div className="flex items-start gap-3 rounded-md border p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">You signed this waiver on {fmt(data.signedAt)}.</p>
            <p className="text-sm text-muted-foreground">
              Version {data.waiver.version}. Nothing else to do.{" "}
              <Link href="/home" className="text-primary underline-offset-4 hover:underline">
                Back to Home
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Please read your gym&apos;s waiver, then type your full name and tick the box to sign it.
        </p>
      )}

      <WaiverText body={data.waiver.body} version={data.waiver.version} />

      {!data.signedAt ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameOk && agree) void sign();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="waiver-name">Your full name</Label>
            <Input
              id="waiver-name"
              className="h-11"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={100}
            />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="waiver-agree"
              className="mt-0.5 h-5 w-5"
              checked={agree}
              onCheckedChange={(v) => setAgree(v === true)}
            />
            <Label htmlFor="waiver-agree" className="font-normal leading-snug">
              I have read and agree to this waiver.
            </Label>
          </div>
          <Button
            type="submit"
            className="h-11 w-full sm:w-fit"
            disabled={!nameOk || !agree || saving}
          >
            {saving ? "Signing..." : "Sign waiver"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
