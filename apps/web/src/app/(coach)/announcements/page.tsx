"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import {
  ANNOUNCEMENT_DEFAULT_DAYS,
  ANNOUNCEMENT_MAX_DAYS,
  addDaysToDate,
  createAnnouncementSchema,
} from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { useGymToday } from "@/hooks/use-gym-today";
import { EmptyState } from "@/components/shared/empty-state";
import { AnnouncementCard, type AnnouncementView } from "@/components/shared/announcement-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

/** How long ended announcements stay listed here (for reference). */
const ENDED_DAYS_SHOWN = 30;

function useAnnouncements(today: string | null) {
  return useQuery({
    queryKey: ["announcements", today],
    enabled: !!today,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, show_until, created_at")
        .gte("show_until", addDaysToDate(today!, -ENDED_DAYS_SHOWN))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnnouncementView[];
    },
  });
}

type FieldErrors = Partial<Record<"title" | "body" | "show_until", string>>;

function NewAnnouncementForm({ today, onPosted }: { today: string; onPosted: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showUntil, setShowUntil] = useState(addDaysToDate(today, ANNOUNCEMENT_DEFAULT_DAYS));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The gym's today can roll over while the page is open; keep the date valid.
  useEffect(() => {
    setShowUntil((v) => (v < today ? addDaysToDate(today, ANNOUNCEMENT_DEFAULT_DAYS) : v));
  }, [today]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createAnnouncementSchema.safeParse({ title, body, show_until: showUntil });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const resBody = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Posted. Members see it on their Home page.");
        setTitle("");
        setBody("");
        setShowUntil(addDaysToDate(today, ANNOUNCEMENT_DEFAULT_DAYS));
        onPosted();
      } else {
        setFormError(resBody.error ?? "Couldn't post the announcement.");
      }
    } catch {
      setFormError("Couldn't post — check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-md border p-4"
      aria-labelledby="new-announcement-heading"
    >
      <h2 id="new-announcement-heading" className="text-lg font-medium">
        New announcement
      </h2>
      <div className="flex flex-col gap-2">
        <Label htmlFor="announcement-title">Title</Label>
        <Input
          id="announcement-title"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Closed Monday for the bank holiday"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "announcement-title-error" : undefined}
          className="h-11"
        />
        {errors.title ? (
          <p id="announcement-title-error" className="text-sm text-destructive">
            {errors.title}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="announcement-body">Message (optional)</Label>
        <Textarea
          id="announcement-body"
          value={body}
          maxLength={2000}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details, times, what to bring…"
          aria-invalid={!!errors.body}
          aria-describedby={errors.body ? "announcement-body-error" : undefined}
        />
        {errors.body ? (
          <p id="announcement-body-error" className="text-sm text-destructive">
            {errors.body}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Every member can read this. Don&apos;t include anyone&apos;s personal details.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="announcement-until">Show until (inclusive)</Label>
        <Input
          id="announcement-until"
          type="date"
          value={showUntil}
          min={today}
          max={addDaysToDate(today, ANNOUNCEMENT_MAX_DAYS)}
          onChange={(e) => setShowUntil(e.target.value)}
          aria-invalid={!!errors.show_until}
          aria-describedby={errors.show_until ? "announcement-until-error" : undefined}
          className="h-11 w-full sm:w-56"
        />
        {errors.show_until ? (
          <p id="announcement-until-error" className="text-sm text-destructive">
            {errors.show_until}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      <Button type="submit" className="h-11 self-start" disabled={submitting}>
        {submitting ? "Posting..." : "Post to members"}
      </Button>
    </form>
  );
}

export default function AnnouncementsPage() {
  const today = useGymToday();
  const { data: announcements, isPending, error } = useAnnouncements(today);
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Announcement taken down.");
        refetch();
      } else {
        toast.error(body.error ?? "Couldn't take it down.");
      }
    } catch {
      toast.error("Couldn't take it down — check your connection.");
    } finally {
      setDeletingId(null);
    }
  }

  const live = today ? (announcements ?? []).filter((a) => a.show_until >= today) : [];
  const ended = today ? (announcements ?? []).filter((a) => a.show_until < today) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl tracking-wide">Announcements</h1>
        <p className="text-sm text-muted-foreground">
          Closures, seminars, gradings. Shown at the top of every member&apos;s Home page until the
          date you pick.
        </p>
      </div>

      {today ? <NewAnnouncementForm today={today} onPosted={refetch} /> : null}

      {!today || isPending ? (
        <p className="text-sm text-muted-foreground">Loading announcements...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load announcements. Try refreshing.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2" aria-labelledby="live-heading">
            <h2 id="live-heading" className="text-lg font-medium">
              Showing now
            </h2>
            {live.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Nothing showing"
                description="Post one above and every member sees it on their Home page."
              />
            ) : (
              live.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  today={today}
                  footer={
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="mt-2 h-11 self-start"
                          disabled={deletingId === a.id}
                        >
                          {deletingId === a.id ? "Taking down..." : "Take down"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Take down this announcement?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Members stop seeing &ldquo;{a.title}&rdquo; straight away. To change the
                            wording, take it down and post it again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
                          <AlertDialogAction className="h-11" onClick={() => handleDelete(a.id)}>
                            Take down
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  }
                />
              ))
            )}
          </section>

          {ended.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="ended-heading">
              <h2 id="ended-heading" className="text-lg font-medium">
                Ended in the last {ENDED_DAYS_SHOWN} days
              </h2>
              {ended.map((a) => (
                <div key={a.id} className="opacity-70">
                  <AnnouncementCard announcement={a} today={today} />
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
