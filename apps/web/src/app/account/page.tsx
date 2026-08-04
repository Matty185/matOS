"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { accountEditSchema, type AccountEditInput } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const passwordSchema = z
  .object({
    password: z.string().min(8, "At least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });
type PasswordInput = z.infer<typeof passwordSchema>;

function useOwnMember() {
  return useQuery({
    queryKey: ["my-account"],
    queryFn: async () => {
      const supabase = createClient();
      // Resolves the unambiguous current member id via the
      // public.current_member() RPC first — a direct
      // .eq("user_id", user.id).single() query would throw once this
      // account has more than one members row (Stage S2: a personal
      // workspace plus a real gym). Then fetches the extra fields this
      // page needs by primary key, which is never ambiguous.
      const { data: current, error: currentError } = await supabase.rpc("current_member");
      const currentMember = current?.[0];
      if (currentError || !currentMember) throw currentError ?? new Error("No member record");

      const { data: member, error } = await supabase
        .from("members")
        .select("id, phone, emergency_contact_name, emergency_contact_phone")
        .eq("id", currentMember.id)
        .single();
      if (error || !member) throw error ?? new Error("No member record");

      // Whether *any* active membership (not just the current one) is a
      // real gym — the solo delete action needs to know this up front, so
      // a user who's currently viewing their personal workspace but also
      // belongs to a real gym elsewhere sees the "you also belong to a
      // gym" message immediately, not only after clicking through the
      // destructive confirm dialog (the API route enforces this
      // regardless; this just makes the UI tell them before they ask).
      //
      // `.eq("user_id", currentMember.user_id)` is explicit here, not left
      // to RLS alone — matching the fix already applied to the sibling
      // getUserGymMemberships() in lib/auth/current-member.ts:
      // memberships_select_staff deliberately lets a coach/owner read
      // every member's memberships row in their gym, not just their own,
      // so an unfiltered query here would (in principle) pull in
      // coworkers' rows too. Flagged independently by both the security
      // and code review passes for this stage.
      const { data: memberships } = await supabase
        .from("memberships")
        .select("gyms(kind)")
        .eq("user_id", currentMember.user_id)
        .eq("active", true);
      const hasRealGymMembership = memberships?.some((m) => m.gyms?.kind === "gym") ?? false;

      return { ...member, gymKind: currentMember.gym_kind, hasRealGymMembership };
    },
  });
}

export default function AccountPage() {
  const { data: member, isLoading, refetch } = useOwnMember();
  const isSolo = member?.gymKind === "personal";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Account</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : member ? (
        <>
          <ContactCard member={member} onSaved={refetch} />
          <PasswordCard />
          <DataPrivacyCard
            memberId={member.id}
            isSolo={isSolo}
            hasRealGymMembership={member.hasRealGymMembership}
          />
          <ShareLinksCard />
        </>
      ) : (
        <p className="text-sm text-destructive">Couldn&apos;t load your account. Try refreshing.</p>
      )}
    </div>
  );
}

type ShareLink = {
  id: string;
  type: "profile" | "breakdown";
  redact_opponents: boolean;
  revoked: boolean;
  created_at: string;
};

// Stage S3: minimal management surface for links created via ShareDialog
// elsewhere in the app — see them, revoke them. Not itself where links
// are created (that stays contextual, on the profile/breakdown being
// shared) — this is just "what have I shared" visibility.
function ShareLinksCard() {
  const {
    data: shareLinks,
    isLoading,
    isError,
    refetch,
  } = useQuery<ShareLink[]>({
    queryKey: ["share-links"],
    queryFn: async () => {
      const res = await fetch("/api/share-links");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load share links");
      return body.shareLinks;
    },
  });

  const active = shareLinks?.filter((s) => !s.revoked) ?? [];

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/share-links/${id}/revoke`, { method: "POST" });
    if (res.ok) {
      toast.success("Share link revoked.");
      refetch();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Something went wrong.");
    }
  }

  // Distinct from "no links yet" (silently render nothing — there's no
  // create action on this card to anchor an empty state around, creation
  // is intentionally contextual on the profile/breakdown being shared):
  // a fetch failure needs to say so, not look identical to "you haven't
  // shared anything," which a user with real active links could
  // otherwise mistake for their links having quietly disappeared.
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share links</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Couldn&apos;t load your share links. Try refreshing.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || active.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share links</CardTitle>
        <CardDescription>
          Links you&apos;ve generated to share your profile or matches.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {active.map((link) => (
          <div
            key={link.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">
                {link.type === "profile" ? "Profile" : "Breakdown"}
              </span>
              <span className="text-xs text-muted-foreground">
                Created {format(new Date(link.created_at), "MMM d, yyyy")}
                {link.redact_opponents ? " · names hidden" : ""}
              </span>
            </div>
            <Button variant="outline" className="h-11" onClick={() => handleRevoke(link.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ContactCard({
  member,
  onSaved,
}: {
  member: {
    phone: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  };
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AccountEditInput>({
    resolver: zodResolver(accountEditSchema),
    defaultValues: {
      phone: member.phone ?? "",
      emergency_contact_name: member.emergency_contact_name ?? "",
      emergency_contact_phone: member.emergency_contact_phone ?? "",
    },
  });

  async function onSubmit(data: AccountEditInput) {
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      toast.success("Contact details updated.");
      onSaved();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Something went wrong.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contact details</CardTitle>
        <CardDescription>Your phone and emergency contact.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" className="h-11" {...register("phone")} />
            {errors.phone ? (
              <p className="text-sm text-destructive">{errors.phone.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergency_contact_name">Emergency contact name</Label>
            <Input
              id="emergency_contact_name"
              className="h-11"
              {...register("emergency_contact_name")}
            />
            {errors.emergency_contact_name ? (
              <p className="text-sm text-destructive">{errors.emergency_contact_name.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergency_contact_phone">Emergency contact phone</Label>
            <Input
              id="emergency_contact_phone"
              className="h-11"
              {...register("emergency_contact_phone")}
            />
            {errors.emergency_contact_phone ? (
              <p className="text-sm text-destructive">{errors.emergency_contact_phone.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11 w-fit">
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema) });

  async function onSubmit(data: PasswordInput) {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" className="h-11" {...register("password")} />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              className="h-11"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
            ) : null}
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11 w-fit">
            {isSubmitting ? "Updating..." : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DataPrivacyCard({
  memberId,
  isSolo,
  hasRealGymMembership,
}: {
  memberId: string;
  isSolo: boolean;
  hasRealGymMembership: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data & privacy</CardTitle>
        <CardDescription>
          Download everything MatOS holds about you, or delete your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button asChild variant="outline" className="h-11 w-fit">
          <a href="/api/account/export">Request my data (download JSON)</a>
        </Button>

        {isSolo && hasRealGymMembership ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">You also belong to a gym</p>
            <p className="text-muted-foreground">
              Account deletion for gym members goes through your coach&apos;s request flow — switch
              to that gym to request it.
            </p>
          </div>
        ) : isSolo ? (
          <SoloDeleteAction />
        ) : (
          <GymDeleteRequestAction memberId={memberId} />
        )}
      </CardContent>
    </Card>
  );
}

// Gym-context: unchanged from before Stage S2 — request-then-coach-
// executes, matching CLAUDE.md Rule 6 (gym data is anonymised, not
// hard-deleted, and a coach reviews it).
function GymDeleteRequestAction({ memberId }: { memberId: string }) {
  const [pendingRequest, setPendingRequest] = useState<{ requested_at: string } | null | undefined>(
    undefined,
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("deletion_requests")
      .select("requested_at")
      .eq("member_id", memberId)
      .is("executed_at", null)
      .maybeSingle()
      .then(({ data }) => setPendingRequest(data ?? null));
  }, [memberId]);

  async function handleDeleteRequest() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/delete-request", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Deletion request submitted. Your coach will review it.");
        setPendingRequest({ requested_at: new Date().toISOString() });
      } else {
        toast.error(body.error ?? "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingRequest === undefined) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (pendingRequest) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">Deletion requested</p>
        <p className="text-muted-foreground">
          Submitted {format(new Date(pendingRequest.requested_at), "MMM d, yyyy")} — pending your
          coach&apos;s review.
        </p>
      </div>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-11 w-fit">
          Request account deletion
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request account deletion?</AlertDialogTitle>
          <AlertDialogDescription>
            Your coach will review and execute this. Once executed, your MatOS login is permanently
            deleted (you won&apos;t be able to sign in again), your personal details are anonymised,
            and your attendance, logs, and match breakdowns are permanently deleted. Payment and
            audit records are retained but anonymised.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-11" disabled={submitting} onClick={handleDeleteRequest}>
            {submitting ? "Submitting..." : "Request deletion"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Solo (personal-workspace-only) context: Stage S2 — immediate, no coach
// review (there is no coach; this account IS the workspace owner). Scoped
// server-side too (api/account/delete-solo rejects anyone who also holds
// a real gym membership) — this button being shown at all already implies
// that, but the route never trusts the client's own gymKind read alone.
function SoloDeleteAction() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/delete-solo", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        await createClient().auth.signOut();
        router.replace("/login");
      } else {
        toast.error(body.error ?? "Something went wrong.");
        setSubmitting(false);
      }
    } catch {
      toast.error("Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-11 w-fit">
          Delete my account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your workspace and all your match breakdowns, and your MatOS
            login is removed immediately — you won&apos;t be able to sign in again. This can&apos;t
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-11" disabled={submitting} onClick={handleDelete}>
            {submitting ? "Deleting..." : "Delete everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
