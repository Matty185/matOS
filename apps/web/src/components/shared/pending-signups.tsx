"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { BeltDisplay } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
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
import type { BeltColor } from "@matos/shared";

export type PendingSignup = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  belt: BeltColor;
  stripes: number;
  created_at: string;
};

/**
 * People who signed up with the permanent join QR code and are waiting for a
 * coach. Approve makes them a member; Reject removes the sign-up and its
 * login. Renders nothing when nobody is waiting.
 */
export function PendingSignups({ pending }: { pending: PendingSignup[] }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (pending.length === 0) return null;

  async function act(id: string, action: "approve" | "reject", name: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/members/${id}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong. Try again.");
        return;
      }
      toast.success(
        action === "approve" ? `${name} is now a member.` : `${name}'s sign-up was removed.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["members"] });
      // The dashboard count is server-rendered.
      router.refresh();
    } catch {
      toast.error("Couldn't reach MatOS. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-labelledby="pending-signups-heading"
      className="flex flex-col gap-3 rounded-md border border-amber-600/50 bg-amber-50 p-3 dark:bg-amber-950/30"
    >
      <div className="flex flex-col gap-1">
        <h2 id="pending-signups-heading" className="text-sm font-medium">
          {pending.length === 1
            ? "1 sign-up waiting for approval"
            : `${pending.length} sign-ups waiting for approval`}
        </h2>
        <p className="text-sm text-muted-foreground">
          From the permanent join QR code. They can&apos;t use MatOS until you approve them. Reject
          anyone you don&apos;t recognise.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {pending.map((m) => {
          const name = `${m.first_name} ${m.last_name}`;
          return (
            <li
              key={m.id}
              className="flex flex-col gap-3 rounded-md border bg-background p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{name}</span>
                <span className="break-all text-muted-foreground">
                  {[m.email, m.phone].filter(Boolean).join(" · ")}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BeltDisplay belt={m.belt} stripes={m.stripes} />
                  Signed up {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  className="h-11"
                  disabled={busy === m.id}
                  onClick={() => act(m.id, "approve", name)}
                >
                  Approve
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="h-11" disabled={busy === m.id}>
                      Reject
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reject {name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Their sign-up and login are removed. If they&apos;re a real member, add them
                        or send them a personal invite instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11">Keep</AlertDialogCancel>
                      <AlertDialogAction className="h-11" onClick={() => act(m.id, "reject", name)}>
                        Reject
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
