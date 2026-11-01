"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import { addCoachSchema, type AddCoachInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { ALL_BELTS, BELT_LABELS, BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { InviteShareDialog, type InviteShareMember } from "@/components/shared/invite-share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@matos/shared";

type Role = Database["public"]["Enums"]["member_role"];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "gym_owner", label: "Owner" },
  { value: "coach", label: "Coach" },
  { value: "athlete", label: "Athlete (remove from team)" },
];

function useTeam() {
  return useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: staff, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, role, user_id, active, belt, stripes")
        .in("role", ["gym_owner", "coach"])
        .eq("active", true)
        .order("role", { ascending: false })
        .order("first_name");
      if (error) throw error;
      const { data: invites, error: invitesError } = await supabase
        .from("invites")
        .select("member_id, claimed_at, expires_at, created_at")
        .in(
          "member_id",
          staff.map((m) => m.id),
        )
        .order("created_at", { ascending: false });
      if (invitesError) throw invitesError;
      const latest = new Map<string, { claimed_at: string | null; expires_at: string }>();
      for (const i of invites) if (!latest.has(i.member_id)) latest.set(i.member_id, i);
      return { staff, latest };
    },
  });
}

/**
 * Stage O5: Settings → Team (owner only; also the /setup wizard's coaches
 * step). Coaches are added here, invited with the same share-link dialog
 * as members, promoted to co-owner, or moved back to athlete. The database
 * enforces owner-only role changes and that a gym always keeps an owner.
 */
export function TeamManager({ currentMemberId }: { currentMemberId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useTeam();
  const [addOpen, setAddOpen] = useState(false);
  const [inviteMember, setInviteMember] = useState<InviteShareMember | null>(null);
  const [changingId, setChangingId] = useState<string | null>(null);
  // Role changes alter what someone can see (payments, every member's
  // details) — confirmed, never a single mis-tap.
  const [pendingRole, setPendingRole] = useState<{
    memberId: string;
    name: string;
    role: Role;
  } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  async function changeRole(memberId: string, name: string, role: Role) {
    setChangingId(memberId);
    try {
      const res = await fetch(`/api/team/${memberId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't change their role.");
        return;
      }
      toast.success(
        role === "athlete"
          ? `${name} is now an athlete.`
          : `${name} is now ${role === "gym_owner" ? "an owner" : "a coach"}.`,
      );
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    } catch {
      toast.error("Couldn't change their role — check your connection.");
    } finally {
      setChangingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading team...</p>;
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">Couldn&apos;t load your team. Try refreshing.</p>
    );
  }

  const activeOwners = data.staff.filter((m) => m.role === "gym_owner").length;

  return (
    <div className="flex flex-col gap-4">
      {data.staff.length <= 1 ? (
        <EmptyState
          icon={Users}
          title="It's just you so far"
          description="Add the coaches who run classes — they can take attendance, add members and record payments."
          actionLabel="Add a coach"
          onAction={() => setAddOpen(true)}
        />
      ) : null}

      <ul className="flex flex-col divide-y rounded-md border">
        {data.staff.map((m) => {
          const name = `${m.first_name} ${m.last_name}`;
          const isSelf = m.id === currentMemberId;
          const invite = data.latest.get(m.id);
          const status = m.user_id
            ? "joined"
            : !invite
              ? "not_invited"
              : new Date(invite.expires_at) < new Date()
                ? "expired"
                : "invited";
          // The DB would refuse demoting the last owner anyway; this just
          // doesn't offer it.
          const lockedRole = isSelf || (m.role === "gym_owner" && activeOwners <= 1);
          return (
            <li key={m.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {name}
                  {isSelf ? <Badge variant="secondary">You</Badge> : null}
                  {status === "joined" ? null : status === "invited" ? (
                    <Badge variant="secondary">Invited</Badge>
                  ) : status === "expired" ? (
                    <Badge variant="destructive">Invite expired</Badge>
                  ) : (
                    <Badge variant="outline" className="border-dashed text-muted-foreground">
                      Not invited
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BeltDisplay belt={m.belt} stripes={m.stripes} size="sm" />
                  <span className="truncate">{m.email}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {status !== "joined" ? (
                  <Button
                    variant={status === "invited" ? "outline" : "default"}
                    className="h-11"
                    onClick={() =>
                      setInviteMember({
                        id: m.id,
                        first_name: m.first_name,
                        email: m.email,
                        phone: m.phone,
                      })
                    }
                  >
                    {status === "invited" ? "Share link" : "Invite"}
                  </Button>
                ) : null}
                <Select
                  value={m.role}
                  disabled={lockedRole || changingId === m.id}
                  onValueChange={(v) => setPendingRole({ memberId: m.id, name, role: v as Role })}
                >
                  <SelectTrigger className="h-11 w-36" aria-label={`${name}'s role`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </li>
          );
        })}
      </ul>

      {data.staff.length > 1 ? (
        <Button variant="outline" className="h-11 self-start" onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Add a coach
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Owners manage gym settings and the team; coaches run everything else. Already have a member
        who coaches? Open their profile and choose &ldquo;Make coach&rdquo;.
      </p>

      <AlertDialog
        open={pendingRole !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRole(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRole?.role === "gym_owner"
                ? `Make ${pendingRole?.name} an owner?`
                : pendingRole?.role === "coach"
                  ? `Make ${pendingRole?.name} a coach?`
                  : `Remove ${pendingRole?.name} from the team?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole?.role === "gym_owner"
                ? "Owners can change gym settings and manage the whole team, including you."
                : pendingRole?.role === "coach"
                  ? "Coaches can see every member's details, payments and attendance."
                  : "They'll become an athlete and lose access to the coach area."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11"
              onClick={() => {
                if (pendingRole)
                  void changeRole(pendingRole.memberId, pendingRole.name, pendingRole.role);
                setPendingRole(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddCoachDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={async (member) => {
          setAddOpen(false);
          await refresh();
          setInviteMember(member);
        }}
      />
      {inviteMember ? (
        <InviteShareDialog
          member={inviteMember}
          open={inviteMember !== null}
          onOpenChange={(open) => {
            if (!open) setInviteMember(null);
          }}
          hasActiveInvite={(() => {
            const inv = data.latest.get(inviteMember.id);
            return Boolean(inv && !inv.claimed_at && new Date(inv.expires_at) > new Date());
          })()}
          onInviteCreated={() => void refresh()}
        />
      ) : null}
    </div>
  );
}

function AddCoachDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (member: InviteShareMember) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddCoachInput>({
    // Cast: the schema's .default()s make belt/stripes optional on its
    // *input* type; defaultValues below always supply them (same approach
    // as member-form.tsx).
    resolver: zodResolver(addCoachSchema) as never,
    defaultValues: { first_name: "", last_name: "", email: "", belt: "black", stripes: 0 },
  });

  async function onSubmit(data: AddCoachInput) {
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't add the coach.");
        return;
      }
      toast.success(`${data.first_name} added as a coach.`);
      reset();
      onAdded({ id: body.memberId, first_name: data.first_name, email: data.email, phone: null });
    } catch {
      toast.error("Couldn't add the coach — check your connection.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a coach</DialogTitle>
          <DialogDescription>
            You&apos;ll get a sign-up link to send them straight after.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-first">First name</Label>
              <Input id="coach-first" className="h-11" {...register("first_name")} />
              {errors.first_name ? (
                <p className="text-sm text-destructive">{errors.first_name.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-last">Last name</Label>
              <Input id="coach-last" className="h-11" {...register("last_name")} />
              {errors.last_name ? (
                <p className="text-sm text-destructive">{errors.last_name.message}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coach-email">Email</Label>
            <Input id="coach-email" type="email" className="h-11" {...register("email")} />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-belt">Belt</Label>
              <Controller
                name="belt"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="coach-belt" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_BELTS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BELT_LABELS[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="coach-stripes">Stripes</Label>
              <Controller
                name="stripes"
                control={control}
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? 0)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="coach-stripes" className="h-11 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {String(n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <Button type="submit" className="h-11" disabled={isSubmitting}>
            {isSubmitting ? "Adding..." : "Add coach"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
