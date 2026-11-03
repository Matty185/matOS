"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Mail, Phone, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  TRIAL_EXPERIENCE_LABELS,
  TRIAL_STATUS_LABELS,
  TRIAL_STATUS_VALUES,
  formatSessionDate,
  type Database,
  type TrialStatus,
} from "@matos/shared";

type Lead = Database["public"]["Tables"]["trial_leads"]["Row"] & {
  classes: { name: string; start_time: string } | null;
};

const OPEN: TrialStatus[] = ["new", "contacted", "booked", "attended"];
const FILTERS = [
  { value: "open", label: "To follow up" },
  { value: "converted", label: "Joined" },
  { value: "not_interested", label: "Not interested" },
  { value: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

function statusVariant(s: TrialStatus) {
  if (s === "new") return "default" as const;
  if (s === "converted") return "secondary" as const;
  if (s === "not_interested") return "outline" as const;
  return "secondary" as const;
}

// Flow audit 9.1: trial requests from the gym's public link. Coaches follow
// up, move the status along, keep a note, and "Add as member" when the
// person joins.
export default function TrialsPage() {
  const [filter, setFilter] = useState<Filter>("open");
  const {
    data: leads,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["trial-leads"],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("trial_leads")
        .select("*, classes(name, start_time)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Lead[];
    },
  });

  const shown = (leads ?? []).filter((l) =>
    filter === "all" ? true : filter === "open" ? OPEN.includes(l.status) : l.status === filter,
  );
  const header = (
    <div className="flex flex-col gap-1">
      <h1 className="font-heading text-3xl tracking-wide">Trials</h1>
      <p className="text-sm text-muted-foreground">
        Requests from your public trial link. Nothing is booked automatically: get in touch, then
        update the status.
      </p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-muted-foreground">Loading trial requests...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-sm text-destructive">
          Couldn&apos;t load trial requests. Try refreshing.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter trial requests">
        {FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? (leads ?? []).length
              : f.value === "open"
                ? (leads ?? []).filter((l) => OPEN.includes(l.status)).length
                : (leads ?? []).filter((l) => l.status === f.value).length;
          return (
            <Button
              key={f.value}
              variant={filter === f.value ? "default" : "outline"}
              className="h-11"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label} ({count})
            </Button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={(leads ?? []).length === 0 ? "No trial requests yet" : "Nothing here"}
          description={
            (leads ?? []).length === 0
              ? "Share your free trial link (Settings → Free trial link) on your website or socials, and requests will appear here."
              : "No trial requests match this filter."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((lead) => (
            // Keyed on the saved note so a refetch (another coach's edit)
            // resets the textarea instead of being overwritten later.
            <LeadCard key={`${lead.id}:${lead.coach_notes ?? ""}`} lead={lead} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(lead.coach_notes ?? "");
  const [busy, setBusy] = useState(false);
  const converted = lead.status === "converted";

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/trial-leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(out.error ?? "Couldn't save.");
        return;
      }
      toast.success(success);
      queryClient.invalidateQueries({ queryKey: ["trial-leads"] });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/trial-leads/${lead.id}`, { method: "DELETE" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(out.error ?? "Couldn't delete.");
        return;
      }
      toast.success("Trial request deleted.");
      queryClient.invalidateQueries({ queryKey: ["trial-leads"] });
    } finally {
      setBusy(false);
    }
  }

  const name = `${lead.first_name} ${lead.last_name}`;
  return (
    <li className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          <Badge variant={statusVariant(lead.status)}>{TRIAL_STATUS_LABELS[lead.status]}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.email ? (
          <Button asChild variant="outline" size="sm" className="h-11">
            <a href={`mailto:${lead.email}`}>
              <Mail className="mr-2 h-4 w-4" aria-hidden />
              {lead.email}
            </a>
          </Button>
        ) : null}
        {lead.phone ? (
          <Button asChild variant="outline" size="sm" className="h-11">
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
              <Phone className="mr-2 h-4 w-4" aria-hidden />
              {lead.phone}
            </a>
          </Button>
        ) : null}
      </div>

      <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
        {lead.for_child ? (
          <>
            <dt className="text-muted-foreground">For</dt>
            <dd>A child (request from {lead.parent_name ?? "a parent"})</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Experience</dt>
        <dd>{TRIAL_EXPERIENCE_LABELS[lead.experience]}</dd>
        <dt className="text-muted-foreground">Wants to try</dt>
        <dd>
          {lead.session_date
            ? `${lead.classes?.name ?? "A class (since removed)"}, ${formatSessionDate(lead.session_date)}`
            : "Not sure yet"}
        </dd>
        {lead.message ? (
          <>
            <dt className="text-muted-foreground">Message</dt>
            <dd className="whitespace-pre-wrap break-words">{lead.message}</dd>
          </>
        ) : null}
      </dl>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`status-${lead.id}`}>Status</Label>
          <Select
            value={lead.status}
            disabled={busy || converted}
            onValueChange={(v) =>
              patch(
                { status: v },
                `Marked as ${TRIAL_STATUS_LABELS[v as TrialStatus].toLowerCase()}.`,
              )
            }
          >
            <SelectTrigger id={`status-${lead.id}`} className="h-11 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIAL_STATUS_VALUES.filter((s) => s !== "converted" || converted).map((s) => (
                <SelectItem key={s} value={s}>
                  {TRIAL_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {converted ? (
          lead.converted_member_id ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={`/members/${lead.converted_member_id}`}>View member</Link>
            </Button>
          ) : null
        ) : (
          <Button asChild className="h-11">
            <Link href={`/members/new?lead=${lead.id}`}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              Add as member
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`notes-${lead.id}`}>Notes for coaches</Label>
        <Textarea
          id={`notes-${lead.id}`}
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Called Tuesday, coming Thursday 7pm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={busy || notes.trim() === (lead.coach_notes ?? "")}
            onClick={() => patch({ coach_notes: notes }, "Note saved.")}
          >
            Save note
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="h-11" disabled={busy}>
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {name}&apos;s request?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their details are removed for good. Use this for spam, or when someone asks for
                  their details to be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction className="h-11" onClick={remove}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </li>
  );
}
