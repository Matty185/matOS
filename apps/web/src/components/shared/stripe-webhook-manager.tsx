"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { stripeWebhookSecretSchema } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

type Hook = {
  endpoint_id: string;
  connected_at: string | null;
  last_event_at: string | null;
};

const EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
];

function useStripeWebhook() {
  return useQuery({
    queryKey: ["stripe-webhook"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("gym_stripe_webhooks")
        .select("endpoint_id, connected_at, last_event_at")
        .maybeSingle();
      if (error) throw error;
      return (data as Hook | null) ?? null;
    },
  });
}

/**
 * Stage L2, owner only: connect the academy's own Stripe account so that a
 * member paying through a plan's payment link marks the month paid. The
 * owner adds a webhook in Stripe pointing at this academy's address, then
 * pastes its signing secret here (stored encrypted, never shown again).
 */
export function StripeWebhookManager() {
  const { data: hook, isPending, isError } = useStripeWebhook();
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"setup" | "save" | "disconnect" | null>(null);
  const [replacing, setReplacing] = useState(false);

  const url = hook
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/api/stripe/webhook/${hook.endpoint_id}`
    : null;

  function refetch() {
    return queryClient.invalidateQueries({ queryKey: ["stripe-webhook"] });
  }

  async function call(method: "POST" | "PUT" | "DELETE", body?: unknown) {
    const res = await fetch("/api/gym/stripe-webhook", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, error: typeof json.error === "string" ? json.error : null };
  }

  async function setup() {
    setBusy("setup");
    try {
      const r = await call("POST");
      if (r.ok) await refetch();
      else toast.error(r.error ?? "Couldn't set it up.");
    } catch {
      toast.error("Couldn't set it up. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function saveSecret(e: React.FormEvent) {
    e.preventDefault();
    const parsed = stripeWebhookSecretSchema.safeParse({ secret });
    if (!parsed.success) {
      setSecretError(parsed.error.issues[0]?.message ?? "Check the secret.");
      return;
    }
    setSecretError(null);
    setBusy("save");
    try {
      const r = await call("PUT", parsed.data);
      if (r.ok) {
        setSecret("");
        setReplacing(false);
        toast.success("Connected. Online payments will now mark months paid.");
        await refetch();
      } else {
        setSecretError(r.error ?? "Couldn't save it.");
      }
    } catch {
      setSecretError("Couldn't save it. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      const r = await call("DELETE");
      if (r.ok) {
        toast.success("Disconnected. Delete the webhook in Stripe too.");
        await refetch();
      } else {
        toast.error(r.error ?? "Couldn't disconnect.");
      }
    } catch {
      toast.error("Couldn't disconnect. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Address copied.");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it.");
    }
  }

  if (isPending) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (isError) {
    return <p className="text-sm text-destructive">Couldn&apos;t load this. Try refreshing.</p>;
  }

  if (!hook) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          When a member pays through a plan&apos;s Stripe payment link, MatOS can mark the month
          paid for you. You add a webhook in your own Stripe account; MatOS never sees card details
          and takes no fee.
        </p>
        <Button className="h-11 w-fit" onClick={setup} disabled={busy !== null}>
          {busy === "setup" ? "Setting up..." : "Set up automatic payments"}
        </Button>
      </div>
    );
  }

  const secretForm = (
    <form onSubmit={saveSecret} className="flex flex-col gap-2" noValidate>
      <Label htmlFor="stripe-signing-secret">Signing secret from Stripe</Label>
      <Input
        id="stripe-signing-secret"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="whsec_..."
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        aria-invalid={secretError ? true : undefined}
        aria-describedby={secretError ? "stripe-secret-error" : undefined}
        className="h-11"
      />
      {secretError ? (
        <p id="stripe-secret-error" className="text-sm text-destructive">
          {secretError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11" disabled={busy !== null}>
          {busy === "save" ? "Saving..." : "Save"}
        </Button>
        {replacing ? (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              setReplacing(false);
              setSecret("");
              setSecretError(null);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );

  const addressBlock = (
    <div className="flex flex-col gap-2">
      <p className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">{url}</p>
      <Button variant="outline" className="h-11 w-fit" onClick={copyUrl}>
        Copy address
      </Button>
    </div>
  );

  const disconnectButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="h-11 w-fit" disabled={busy !== null}>
          {hook.connected_at ? "Disconnect" : "Cancel setup"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop automatic payments?</AlertDialogTitle>
          <AlertDialogDescription>
            Payments still go to your Stripe account, but you&apos;ll mark months paid by hand
            again. Delete the webhook in Stripe as well. Setting it up again gives a new address.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
          <AlertDialogAction className="h-11" onClick={disconnect}>
            {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (!hook.connected_at) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          <li>
            In your Stripe dashboard, open{" "}
            <span className="font-medium">Developers → Webhooks</span> and add an endpoint with this
            address:
            <div className="mt-2">{addressBlock}</div>
          </li>
          <li>
            Choose these events:
            <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
              {EVENTS.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </li>
          <li>Save it, reveal its signing secret and paste it below.</li>
        </ol>
        {secretForm}
        {disconnectButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1">
        <span>
          <Badge>Connected</Badge>
        </span>
        <span className="text-muted-foreground">
          {hook.last_event_at
            ? `Last payment received ${format(new Date(hook.last_event_at), "d MMM yyyy, HH:mm")}.`
            : "No payments received yet. Payments made through a plan's link will show on the Payments page."}
        </span>
        <span className="text-muted-foreground">
          Test-mode payments are listed but never mark a month paid. To switch from test to live,
          add the same address in Stripe&apos;s live mode and replace the signing secret here.
          Months are only marked automatically for plans with a price set.
        </span>
      </div>
      <details className="rounded-md border p-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          Webhook address
        </summary>
        <div className="mt-2">{addressBlock}</div>
      </details>
      {replacing ? (
        secretForm
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setReplacing(true)}>
            Replace signing secret
          </Button>
          {disconnectButton}
        </div>
      )}
    </div>
  );
}
