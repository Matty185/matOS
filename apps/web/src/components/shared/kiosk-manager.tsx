"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { Tablet } from "lucide-react";
import { createKioskDeviceSchema } from "@matos/shared";
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

type Device = {
  id: string;
  name: string;
  activation_expires_at: string | null;
  activated_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function useKioskDevices() {
  return useQuery({
    queryKey: ["kiosk-devices"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("kiosk_devices")
        .select(
          "id, name, activation_expires_at, activated_at, last_seen_at, revoked_at, created_at",
        )
        .is("revoked_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Device[];
    },
  });
}

function deviceStatus(d: Device): { label: string; detail: string } {
  if (d.activated_at) {
    return {
      label: "Active",
      detail: d.last_seen_at ? `Last used ${format(new Date(d.last_seen_at), "d MMM, HH:mm")}` : "",
    };
  }
  const expired = !d.activation_expires_at || new Date(d.activation_expires_at) <= new Date();
  return expired
    ? { label: "Setup link expired", detail: "Remove it and add the tablet again." }
    : {
        label: "Waiting for setup",
        detail: `Setup link works until ${format(new Date(d.activation_expires_at!), "d MMM, HH:mm")}`,
      };
}

/**
 * Flow audit 4.4: owner-only. Register a front-desk tablet as a kiosk (a
 * one-time setup link, shown once as a QR code and link) and remove kiosks.
 */
export function KioskManager() {
  const { data: devices, isPending, error } = useKioskDevices();
  const queryClient = useQueryClient();
  const [name, setName] = useState("Front desk");
  const [nameError, setNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["kiosk-devices"] });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createKioskDeviceSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? "Check the name.");
      return;
    }
    setNameError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/kiosk-devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.url === "string") {
        setSetupUrl(body.url);
        refetch();
      } else {
        setNameError(body.error ?? "Couldn't add the kiosk.");
      }
    } catch {
      setNameError("Couldn't add the kiosk — check your connection.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/kiosk-devices/${id}/revoke`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Kiosk removed. That tablet can't check anyone in now.");
        refetch();
      } else {
        toast.error(body.error ?? "Couldn't remove the kiosk.");
      }
    } catch {
      toast.error("Couldn't remove the kiosk — check your connection.");
    } finally {
      setRemovingId(null);
    }
  }

  async function copySetupUrl() {
    if (!setupUrl) return;
    try {
      await navigator.clipboard.writeText(setupUrl);
      toast.success("Setup link copied.");
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Put a tablet at the door and members (kids too) tap their name to check in. The tablet
        isn&apos;t signed in as anyone: it can only show today&apos;s classes and first names, and
        check people in.
      </p>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading kiosks...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load kiosks. Try refreshing.
        </p>
      ) : devices.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {devices.map((d) => {
            const status = deviceStatus(d);
            return (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tablet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{d.name}</span>
                    <Badge variant={d.activated_at ? "default" : "secondary"}>{status.label}</Badge>
                  </div>
                  {status.detail ? (
                    <span className="text-sm text-muted-foreground">{status.detail}</span>
                  ) : null}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-11" disabled={removingId === d.id}>
                      {removingId === d.id ? "Removing..." : "Remove"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove &ldquo;{d.name}&rdquo;?</AlertDialogTitle>
                      <AlertDialogDescription>
                        That tablet stops working as a kiosk straight away. Check-ins already made
                        stay.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
                      <AlertDialogAction className="h-11" onClick={() => handleRemove(d.id)}>
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            );
          })}
        </ul>
      ) : null}

      {setupUrl ? (
        <div className="flex flex-col gap-3 rounded-md border border-primary/40 p-4">
          <p className="font-medium">Open this on the tablet</p>
          <p className="text-sm text-muted-foreground">
            Scan the code with the tablet&apos;s camera, or send the link to it. It works once, for
            24 hours, and isn&apos;t shown again. Then leave the tablet on the kiosk screen.
          </p>
          <div className="self-start rounded-md bg-white p-2">
            <QRCodeSVG value={setupUrl} size={208} level="M" marginSize={1} />
          </div>
          <code className="break-all rounded bg-muted p-2 text-xs">{setupUrl}</code>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={copySetupUrl}>
              Copy link
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setSetupUrl(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreate} noValidate className="flex flex-col gap-2">
          <Label htmlFor="kiosk-name">Tablet name</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="kiosk-name"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "kiosk-name-error" : undefined}
              className="h-11 w-full sm:w-64"
            />
            <Button type="submit" className="h-11" disabled={creating}>
              {creating ? "Adding..." : "Add a kiosk tablet"}
            </Button>
          </div>
          {nameError ? (
            <p id="kiosk-name-error" className="text-sm text-destructive">
              {nameError}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
