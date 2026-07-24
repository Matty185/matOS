"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { accountEditSchema, type AccountEditInput } from "@/lib/validation/account";
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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: member, error } = await supabase
        .from("members")
        .select("id, phone, emergency_contact_name, emergency_contact_phone")
        .eq("user_id", user.id)
        .single();
      if (error || !member) throw error ?? new Error("No member record");
      return member;
    },
  });
}

export default function AccountPage() {
  const { data: member, isLoading, refetch } = useOwnMember();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Account</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : member ? (
        <>
          <ContactCard member={member} onSaved={refetch} />
          <PasswordCard />
          <DataPrivacyCard memberId={member.id} />
        </>
      ) : (
        <p className="text-sm text-destructive">Couldn&apos;t load your account. Try refreshing.</p>
      )}
    </div>
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

function DataPrivacyCard({ memberId }: { memberId: string }) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data & privacy</CardTitle>
        <CardDescription>
          Download everything MatOS holds about you, or request deletion.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button asChild variant="outline" className="h-11 w-fit">
          <a href="/api/account/export">Request my data (download JSON)</a>
        </Button>

        {pendingRequest === undefined ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : pendingRequest ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Deletion requested</p>
            <p className="text-muted-foreground">
              Submitted {format(new Date(pendingRequest.requested_at), "MMM d, yyyy")} — pending
              your coach&apos;s review.
            </p>
          </div>
        ) : (
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
                  Your coach will review and execute this. Once executed, your MatOS login is
                  permanently deleted (you won&apos;t be able to sign in again), your personal
                  details are anonymised, and your attendance, logs, and match breakdowns are
                  permanently deleted. Payment and audit records are retained but anonymised.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="h-11"
                  disabled={submitting}
                  onClick={handleDeleteRequest}
                >
                  {submitting ? "Submitting..." : "Request deletion"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
