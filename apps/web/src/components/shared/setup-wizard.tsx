"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  PartyPopper,
  Send,
  Users,
  UserCog,
} from "lucide-react";
import { cn, DEFAULT_GYM_TIMEZONE, isValidTimeZone, type UpdateGymInput } from "@matos/shared";
import { createClient } from "@/lib/supabase/client";
import { GymDetailsForm } from "@/components/shared/gym-details-form";
import { TimetableEditor } from "@/components/shared/timetable-editor";
import { TeamManager } from "@/components/shared/team-manager";
import { RosterImporter } from "@/components/shared/roster-importer";
import { BulkInviteDialog } from "@/components/shared/bulk-invite-dialog";
import { SignupLinkDialog } from "@/components/shared/signup-link-dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  { key: "gym", title: "Your gym", icon: Building2, blurb: "The basics members will see." },
  {
    key: "timetable",
    title: "Timetable",
    icon: CalendarDays,
    blurb: "Your weekly classes — members check in to these.",
  },
  { key: "team", title: "Coaches", icon: UserCog, blurb: "Who helps you run classes." },
  { key: "members", title: "Members", icon: Users, blurb: "Your roster, with current belts." },
  { key: "invites", title: "Invites", icon: Send, blurb: "Get members onto MatOS." },
  { key: "done", title: "Done", icon: PartyPopper, blurb: "" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

function useSetupCounts() {
  return useQuery({
    queryKey: ["setup-counts"],
    queryFn: async () => {
      const supabase = createClient();
      const [classes, coaches, athletes, joined, notJoined, pending] = await Promise.all([
        supabase.from("classes").select("id", { count: "exact", head: true }).eq("active", true),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .eq("role", "coach"),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .eq("role", "athlete"),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .eq("role", "athlete")
          .not("user_id", "is", null),
        // Not joined *and* able to: roster-only members (no email) can't
        // be invited, so they aren't counted as waiting.
        supabase
          .from("members")
          .select("id")
          .eq("active", true)
          .eq("role", "athlete")
          .is("user_id", null)
          .not("email", "is", null),
        // Live, unused links — those members already have one in hand, and
        // minting again would silently kill it.
        supabase
          .from("invites")
          .select("member_id")
          .is("claimed_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);
      const pendingIds = new Set((pending.data ?? []).map((i) => i.member_id));
      const notJoinedIds = (notJoined.data ?? []).map((m) => m.id);
      return {
        classes: classes.count ?? 0,
        coaches: coaches.count ?? 0,
        athletes: athletes.count ?? 0,
        joined: joined.count ?? 0,
        waiting: notJoinedIds.filter((id) => pendingIds.has(id)).length,
        notInvitedIds: notJoinedIds.filter((id) => !pendingIds.has(id)),
      };
    },
  });
}

/**
 * Stage O4: six short steps, each skippable, each also reachable later
 * from Settings/Members — so nothing here is a dead end, and "I'll do this
 * later" is always a real option. Finishing (or skipping to the end) marks
 * the gym's onboarding complete so "/" goes to the dashboard from then on.
 */
export function SetupWizard({
  firstName,
  currentMemberId,
  completed,
  gym,
}: {
  firstName: string;
  currentMemberId: string;
  completed: boolean;
  gym: UpdateGymInput;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  // ?step=timetable etc. — dashboard checklist deep links, and the current
  // step survives a refresh.
  const [stepIndex, setStepIndex] = useState(() => {
    const i = STEPS.findIndex((s) => s.key === searchParams.get("step"));
    return i >= 0 ? i : 0;
  });
  // The wizard owns the gym values, so going Back shows what was just
  // saved rather than the stale server-rendered snapshot.
  const [gymValues, setGymValues] = useState<UpdateGymInput>(() => {
    // A freshly provisioned gym still on the default zone: suggest the
    // owner's own browser zone (plan §3.2). Never overrides a chosen zone.
    if (!completed && gym.timezone === DEFAULT_GYM_TIMEZONE) {
      try {
        const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserZone.includes("/") && isValidTimeZone(browserZone)) {
          return { ...gym, timezone: browserZone };
        }
      } catch {
        // fall through to the stored value
      }
    }
    return gym;
  });
  // Previewed-but-not-imported roster rows — leaving the step would lose them.
  const [unsavedRows, setUnsavedRows] = useState(0);
  const handleUnsaved = useCallback((n: number) => setUnsavedRows(n), []);

  // Refresh / tab close with an unimported preview open.
  useEffect(() => {
    if (unsavedRows === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsavedRows]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const [signupLinkOpen, setSignupLinkOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const { data: counts, isFetching: countsFetching } = useSetupCounts();

  const step = STEPS[stepIndex]!;
  const refreshCounts = () => queryClient.invalidateQueries({ queryKey: ["setup-counts"] });

  function goTo(key: StepKey) {
    if (
      step.key === "members" &&
      key !== "members" &&
      unsavedRows > 0 &&
      !window.confirm(
        `You have ${unsavedRows} ${unsavedRows === 1 ? "person" : "people"} in the list who haven't been imported yet. Leave this step and lose them?`,
      )
    ) {
      return;
    }
    if (key !== "members") setUnsavedRows(0);
    void refreshCounts();
    setStepIndex(STEPS.findIndex((s) => s.key === key));
    router.replace(`/setup?step=${key}`, { scroll: false });
    window.scrollTo({ top: 0 });
  }
  const next = () => goTo(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]!.key);
  const back = () => goTo(STEPS[Math.max(stepIndex - 1, 0)]!.key);

  async function finish() {
    setFinishing(true);
    try {
      const res = await fetch("/api/gym/onboarding", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't finish setup — try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Couldn't finish setup — check your connection.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <header className="flex items-center justify-between gap-4">
        <p className="font-heading text-2xl tracking-wide text-primary">MatOS</p>
        <Button asChild variant="ghost" className="h-11">
          <Link
            href="/dashboard"
            onClick={(e) => {
              if (
                unsavedRows > 0 &&
                !window.confirm(
                  `You have ${unsavedRows} ${unsavedRows === 1 ? "person" : "people"} in the list who haven't been imported yet. Leave and lose them?`,
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            {completed ? "Back to dashboard" : "Finish later"}
          </Link>
        </Button>
      </header>

      {/* Progress: one segment per step (the final "Done" isn't a task). */}
      <nav aria-label="Setup progress">
        <ol className="grid grid-cols-5 gap-1">
          {STEPS.slice(0, -1).map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => goTo(s.key)}
                aria-current={i === stepIndex ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s.title}`}
                className="flex min-h-11 w-full flex-col items-start gap-1.5 text-left"
              >
                <span
                  className={cn(
                    "h-1.5 w-full rounded-full",
                    i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-primary/60" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "hidden text-xs sm:block",
                    i === stepIndex ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.title}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-1">
          {step.key !== "done" ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Step {stepIndex + 1} of {STEPS.length - 1}
            </p>
          ) : null}
          <h1 className="font-heading text-3xl tracking-wide">
            {step.key === "gym" ? `Welcome, ${firstName}` : step.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step.key === "gym"
              ? "Let's get your gym set up — about ten minutes. You can skip anything and come back to it."
              : step.blurb}
          </p>
        </div>

        {step.key === "gym" ? (
          <GymDetailsForm
            defaultValues={gymValues}
            submitLabel="Save and continue"
            onSaved={(data) => {
              setGymValues(data);
              next();
            }}
          />
        ) : null}

        {step.key === "timetable" ? <TimetableEditor /> : null}

        {step.key === "team" ? <TeamManager currentMemberId={currentMemberId} /> : null}

        {step.key === "members" ? (
          importedCount === null ? (
            <>
              {counts && counts.athletes > 0 ? (
                <p className="rounded-md bg-muted p-3 text-sm">
                  {counts.athletes} member{counts.athletes === 1 ? " is" : "s are"} already in.
                  Import more below, or carry on.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-3">
                <p className="text-sm text-muted-foreground">
                  Don&apos;t have everyone&apos;s details? Send sign-up links and people fill in
                  their own.
                </p>
                <Button variant="outline" className="h-11" onClick={() => setSignupLinkOpen(true)}>
                  Sign-up link
                </Button>
              </div>
              <SignupLinkDialog
                open={signupLinkOpen}
                onOpenChange={(open) => {
                  setSignupLinkOpen(open);
                  if (!open) void refreshCounts();
                }}
              />
              <RosterImporter
                onUnsavedChange={handleUnsaved}
                onImported={(n) => {
                  setUnsavedRows(0);
                  setImportedCount(n);
                  void refreshCounts();
                  void queryClient.invalidateQueries({ queryKey: ["members"] });
                }}
              />
            </>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-md border p-4">
              <p className="flex items-center gap-2 font-medium">
                <Check className="h-5 w-5 text-green-600" aria-hidden="true" />
                {importedCount} member{importedCount === 1 ? "" : "s"} added.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="h-11" onClick={next}>
                  Next: invite them
                </Button>
                <Button variant="outline" className="h-11" onClick={() => setImportedCount(null)}>
                  Import more
                </Button>
              </div>
            </div>
          )
        ) : null}

        {step.key === "invites" ? (
          <div className="flex flex-col gap-4">
            {!counts || countsFetching ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : counts.athletes === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No members yet — add them in the previous step, or later from Members.
              </p>
            ) : (
              <>
                <ul className="grid grid-cols-3 gap-2">
                  <Summary label="Joined" value={counts.joined} />
                  <Summary label="Link sent" value={counts.waiting} />
                  <Summary label="Not invited" value={counts.notInvitedIds.length} />
                </ul>
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li>
                    <span className="font-medium text-foreground">On the mat:</span> print a sheet
                    of personal QR codes and hand them out — members scan with their phone camera.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">By message:</span> send each
                    person their own link on WhatsApp or text, from the same sheet.
                  </li>
                </ul>
                {counts.notInvitedIds.length > 0 ? (
                  <Button
                    className="h-11 self-start"
                    onClick={() => setBulkIds(counts.notInvitedIds.slice(0, 100))}
                  >
                    Create {Math.min(counts.notInvitedIds.length, 100)} invite link
                    {counts.notInvitedIds.length === 1 ? "" : "s"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Everyone has a link or has joined. Lost links can be re-sent from Members.
                  </p>
                )}
                {counts.notInvitedIds.length > 100 ? (
                  <p className="text-xs text-muted-foreground">
                    Links are made 100 at a time — come back for the rest, or use Members → filter
                    &ldquo;Not invited&rdquo;.
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Each link is personal, works once and expires in 7 days. Making a new link for
                  someone stops their old one working.
                </p>
              </>
            )}
          </div>
        ) : null}

        {step.key === "done" ? (
          <div className="flex flex-col gap-6">
            <ul className="grid gap-2 sm:grid-cols-2">
              <Summary label="Classes a week" value={counts?.classes} />
              <Summary label="Coaches" value={counts?.coaches} />
              <Summary label="Members" value={counts?.athletes} />
              <Summary label="Joined MatOS" value={counts?.joined} />
            </ul>
            <div className="flex flex-col gap-2">
              <h2 className="font-medium">Good next things to try</h2>
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                <li>
                  Open <span className="font-medium text-foreground">Attendance</span> during
                  tonight&apos;s class — check-ins appear live as members tap in.
                </li>
                <li>
                  Ask the assistant (bottom-right button) things like &ldquo;who hasn&apos;t trained
                  in 3 weeks?&rdquo;
                </li>
                <li>
                  Record this month&apos;s payments on{" "}
                  <span className="font-medium text-foreground">Payments</span>.
                </li>
              </ul>
            </div>
            <Button className="h-11 self-start" onClick={finish} disabled={finishing}>
              {finishing ? "Finishing..." : completed ? "Go to dashboard" : "Finish setup"}
            </Button>
          </div>
        ) : null}
      </main>

      {step.key !== "done" ? (
        <footer className="flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" className="h-11" onClick={back} disabled={stepIndex === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button
            variant={step.key === "gym" ? "ghost" : "default"}
            className="h-11"
            onClick={next}
          >
            {step.key === "gym" ? "Skip" : "Continue"}
          </Button>
        </footer>
      ) : null}

      <BulkInviteDialog
        memberIds={bulkIds ?? []}
        open={bulkIds !== null}
        onOpenChange={(open) => {
          if (!open) setBulkIds(null);
        }}
        onDone={() => void refreshCounts()}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number | undefined }) {
  return (
    <li className="flex items-baseline justify-between rounded-md border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-2xl">{value ?? "—"}</span>
    </li>
  );
}
