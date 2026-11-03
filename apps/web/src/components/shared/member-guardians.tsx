"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InviteShareDialog, type InviteShareMember } from "@/components/shared/invite-share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type Person = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  active: boolean;
};
type LinkRow = { id: string; person: Person };

// Flow audit 8.2: parent accounts on the member profile (staff page).
// For an athlete: their parents, "Add a parent" (new parent account, or an
// existing member with that email), invite, and remove. For a parent
// (guardian role): the children they're linked to.
export function MemberGuardians({
  memberId,
  memberName,
  role,
  active,
}: {
  memberId: string;
  memberName: string;
  role: string;
  active: boolean;
}) {
  const queryClient = useQueryClient();
  const isChild = role === "athlete";
  const [addOpen, setAddOpen] = useState(false);
  const [invitePerson, setInvitePerson] = useState<InviteShareMember | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    data: links,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["member-guardians", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("member_guardians")
        .select("id, guardian_member_id, child_member_id")
        .eq(isChild ? "child_member_id" : "guardian_member_id", memberId);
      if (error) throw error;
      const ids = (data ?? []).map((l) => (isChild ? l.guardian_member_id : l.child_member_id));
      if (ids.length === 0) return [] as LinkRow[];
      const { data: people, error: pe } = await supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, user_id, active")
        .in("id", ids);
      if (pe) throw pe;
      const byId = new Map((people ?? []).map((p) => [p.id, p as Person]));
      return (data ?? [])
        .map((l) => ({
          id: l.id,
          person: byId.get(isChild ? l.guardian_member_id : l.child_member_id),
        }))
        .filter((l): l is LinkRow => !!l.person);
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["member-guardians"] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
  }

  async function unlink(linkId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/member-guardians/${linkId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't remove the link.");
        return;
      }
      toast.success("Parent link removed.");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  // Only athletes have parents; only parent accounts list children here.
  if (!isChild && role !== "guardian") return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-labelledby="guardians-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 id="guardians-heading" className="font-medium">
            {isChild ? "Parents" : "Children"}
          </h2>
        </div>
        {isChild && active ? (
          <Button variant="outline" className="h-11" onClick={() => setAddOpen(true)}>
            Add a parent
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">Couldn&apos;t load this.</p>
      ) : !links || links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isChild
            ? `No parent account yet. Add one so a parent can check ${memberName.split(" ")[0]} in, sign their waiver and see their progress.`
            : "Not linked to any children."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map(({ id, person }) => (
            <li
              key={id}
              className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/members/${person.id}`} className="font-medium hover:underline">
                  {person.first_name} {person.last_name}
                </Link>
                {isChild ? (
                  person.user_id ? (
                    <Badge variant="outline">Signed up</Badge>
                  ) : (
                    <Badge variant="secondary">No login yet</Badge>
                  )
                ) : null}
                {!person.active ? <Badge variant="secondary">Inactive</Badge> : null}
              </span>
              {isChild ? (
                <div className="flex flex-wrap gap-2">
                  {!person.user_id && person.email && person.active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11"
                      onClick={() =>
                        setInvitePerson({
                          id: person.id,
                          first_name: person.first_name,
                          email: person.email,
                          phone: person.phone,
                        })
                      }
                    >
                      Invite to sign up
                    </Button>
                  ) : null}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-11" disabled={busy}>
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {person.first_name} as a parent?</AlertDialogTitle>
                        <AlertDialogDescription>
                          They&apos;ll no longer see or check in {memberName.split(" ")[0]}. Their
                          own account stays; deactivate it from their profile if it&apos;s no longer
                          needed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction className="h-11" onClick={() => unlink(id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {addOpen ? (
        <AddGuardianDialog
          childId={memberId}
          childName={memberName}
          onClose={() => setAddOpen(false)}
          onAdded={(person) => {
            setAddOpen(false);
            refresh();
            if (person) setInvitePerson(person);
          }}
        />
      ) : null}
      {invitePerson ? (
        <InviteShareDialog
          member={invitePerson}
          open
          onOpenChange={(o) => {
            if (!o) setInvitePerson(null);
          }}
          hasActiveInvite={false}
          onInviteCreated={refresh}
        />
      ) : null}
    </section>
  );
}

function AddGuardianDialog({
  childId,
  childName,
  onClose,
  onAdded,
}: {
  childId: string;
  childName: string;
  onClose: () => void;
  onAdded: (inviteFor: InviteShareMember | null) => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState(childName.split(" ").slice(1).join(" "));
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const ok = first.trim() && last.trim() && /.+@.+\..+/.test(email.trim());

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/members/${childId}/guardians`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: first, last_name: last, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't add the parent.");
        return;
      }
      if (body.created) {
        toast.success(`${first.trim()} added. Share their invite so they can sign up.`);
        onAdded({
          id: body.guardianMemberId,
          first_name: first.trim(),
          email: email.trim(),
          phone: null,
        });
      } else {
        toast.success("Linked an existing member as the parent.");
        onAdded(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a parent for {childName}</DialogTitle>
          <DialogDescription>
            They get their own login to check {childName.split(" ")[0]} in, sign their waiver and
            see their progress. If someone in your gym already uses this email (a parent who trains,
            or a sibling&apos;s parent), they&apos;re linked instead.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="guardian-first">First name</Label>
            <Input
              id="guardian-first"
              className="h-11"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guardian-last">Last name</Label>
            <Input
              id="guardian-last"
              className="h-11"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="guardian-email">Parent&apos;s email</Label>
          <Input
            id="guardian-email"
            type="email"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
          <p className="text-xs text-muted-foreground">This becomes their login.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button className="h-11" onClick={save} disabled={!ok || saving}>
            {saving ? "Adding..." : "Add parent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
