"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Search } from "lucide-react";
import { formatClassTime, type BeltColor } from "@matos/shared";
import { BeltDisplay } from "@/components/shared/belt-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@matos/shared";

type KioskSession = {
  classId: string;
  name: string;
  startTime: string;
  status: "scheduled" | "cancelled" | "moved_away" | "moved_in";
  note: string | null;
  runs: boolean;
  opens: number;
  closes: number;
};
type KioskMember = { id: string; name: string; belt: BeltColor; stripes: number };
type KioskToday = {
  gymName: string;
  logo: { path: string; url: string } | null;
  today: string;
  minutesOfDay: number;
  sessions: KioskSession[];
  members: KioskMember[];
  checkedIn: Record<string, string[]>;
};

class NotSetUp extends Error {}

/** Clear a half-finished check-in after this long without a tap. */
const IDLE_RESET_MS = 45_000;
/** How long the "You're checked in" screen stays up. */
const SUCCESS_MS = 4_000;

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return formatClassTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
}

function useKioskToday() {
  return useQuery({
    queryKey: ["kiosk-today"],
    queryFn: async (): Promise<KioskToday & { fetchedAt: number }> => {
      // Stamped before the request: the server's minutesOfDay is at least
      // this old, so elapsed time is never under-counted.
      const fetchedAt = Date.now();
      const res = await fetch("/api/kiosk/today", { cache: "no-store" });
      if (res.status === 401) throw new NotSetUp();
      if (!res.ok) throw new Error("load failed");
      return { ...(await res.json()), fetchedAt };
    },
    refetchInterval: 60_000,
    retry: (count, err) => !(err instanceof NotSetUp) && count < 2,
  });
}

/**
 * Flow audit 4.4: the front-desk kiosk. Pick the class (skipped when only
 * one is open), find your name, confirm, done. Runs on a tablet registered
 * by the owner in Settings; there is no signed-in user, and the server
 * re-checks every rule (window, cancellations, roster) on each check-in.
 */
export default function KioskPage() {
  const { data, error, isPending } = useKioskToday();
  const queryClient = useQueryClient();
  // Keep one signed logo URL per path so each poll's fresh signature
  // doesn't reload the image, but swap it after 5 hours: the URL is signed
  // for 6 and the tablet stays open all day.
  const [logo, setLogo] = useState<{ path: string; url: string; at: number } | null>(null);
  useEffect(() => {
    const next = data?.logo ?? null;
    setLogo((prev) => {
      if (!next) return null;
      if (prev?.path === next.path && Date.now() - prev.at < 5 * 3600_000) return prev;
      return { ...next, at: Date.now() };
    });
  }, [data?.logo]);
  const [classId, setClassId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KioskMember | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ firstName: string; className: string } | null>(null);
  const [tick, setTick] = useState(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-evaluate which windows are open between refetches.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  function resetFlow() {
    setQuery("");
    setSelected(null);
    setConfirmError(null);
  }

  // Someone walks away mid check-in: clear it so the next person starts fresh.
  function touch() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      resetFlow();
      setClassId(null);
    }, IDLE_RESET_MS);
  }
  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    [],
  );
  // A half-typed name or an open confirm screen always gets cleared, even if
  // nobody touched the screen after the page loaded.
  useEffect(() => {
    if (query || selected) touch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selected]);

  const nowMinutes = useMemo(() => {
    if (!data) return 0;
    void tick;
    return data.minutesOfDay + Math.floor((Date.now() - data.fetchedAt) / 60_000);
  }, [data, tick]);

  // Past midnight (or after the tablet slept) the data is yesterday's.
  const stale = nowMinutes >= 24 * 60;
  useEffect(() => {
    if (stale) queryClient.invalidateQueries({ queryKey: ["kiosk-today"] });
  }, [stale, queryClient]);

  const openSessions = useMemo(
    () =>
      stale
        ? []
        : (data?.sessions ?? []).filter(
            (s) => s.runs && nowMinutes >= s.opens && nowMinutes <= s.closes,
          ),
    [data, nowMinutes, stale],
  );

  // One open class: skip the picker. A chosen class that closes: drop it.
  const activeClassId =
    classId && openSessions.some((s) => s.classId === classId)
      ? classId
      : openSessions.length === 1
        ? openSessions[0]!.classId
        : null;
  const activeSession = openSessions.find((s) => s.classId === activeClassId) ?? null;

  // A different class (or none) means a different check-in: drop the name.
  useEffect(() => {
    setSelected(null);
    setConfirmError(null);
  }, [activeClassId]);

  const visibleMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.members ?? [];
    return q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all;
  }, [data, query]);
  const checkedInHere = new Set(activeClassId ? (data?.checkedIn[activeClassId] ?? []) : []);

  async function confirm() {
    if (!selected || !activeSession) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      const res = await fetch("/api/kiosk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: activeSession.classId, member_id: selected.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess({ firstName: body.firstName, className: body.className });
        resetFlow();
        queryClient.invalidateQueries({ queryKey: ["kiosk-today"] });
        if (successTimer.current) clearTimeout(successTimer.current);
        successTimer.current = setTimeout(() => setSuccess(null), SUCCESS_MS);
      } else if (res.status === 401) {
        setConfirmError("This tablet is no longer set up as a kiosk.");
        queryClient.invalidateQueries({ queryKey: ["kiosk-today"] });
      } else {
        setConfirmError(body.error ?? "Couldn't check you in. Ask a coach.");
        // The class may have closed or been cancelled since the last refresh.
        if (res.status === 400 || res.status === 409) {
          queryClient.invalidateQueries({ queryKey: ["kiosk-today"] });
        }
      }
    } catch {
      setConfirmError("No internet connection. Ask a coach to mark you present.");
    } finally {
      setSubmitting(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <main
      className="flex min-h-dvh flex-col gap-6 bg-background p-4 sm:p-8"
      onPointerDown={touch}
      onKeyDown={touch}
    >
      {error && data ? (
        <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Connection lost — retrying. Check-ins may not go through until it&apos;s back.
        </p>
      ) : null}
      {children}
    </main>
  );

  if (error instanceof NotSetUp) {
    return shell(
      <div className="m-auto flex max-w-md flex-col gap-3 text-center">
        <h1 className="font-heading text-4xl tracking-wide">MatOS kiosk</h1>
        <p className="text-muted-foreground">
          This tablet isn&apos;t set up as a kiosk (or it was removed). The academy owner can add it
          in Settings → Front-desk kiosk.
        </p>
      </div>,
    );
  }
  if (isPending) {
    return shell(<p className="m-auto text-lg text-muted-foreground">Loading...</p>);
  }
  if (!data) {
    return shell(
      <div className="m-auto flex max-w-md flex-col gap-3 text-center">
        <p role="alert" className="text-lg text-destructive">
          Couldn&apos;t load today&apos;s classes. Check the tablet&apos;s internet connection.
        </p>
        <Button
          className="h-14 text-lg"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["kiosk-today"] })}
        >
          Try again
        </Button>
      </div>,
    );
  }

  if (success) {
    return shell(
      <div className="m-auto flex flex-col items-center gap-4 text-center" role="status">
        <CheckCircle2 className="h-24 w-24 text-success" aria-hidden="true" />
        <p className="font-heading text-5xl tracking-wide">You&apos;re in, {success.firstName}!</p>
        <p className="text-xl text-muted-foreground">Checked in to {success.className}.</p>
      </div>,
    );
  }

  const header = (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={logo.url} alt="" className="h-12 w-auto max-w-[10rem] object-contain" />
        ) : null}
        <h1 className="font-heading text-4xl tracking-wide">{data.gymName}</h1>
      </div>
      <p className="text-lg text-muted-foreground">Tap your name to check in</p>
    </header>
  );

  if (openSessions.length === 0) {
    const later = data.sessions.filter((s) => s.runs && nowMinutes < s.opens);
    const off = data.sessions.filter((s) => !s.runs);
    return shell(
      <>
        {header}
        <div className="flex flex-col gap-4">
          <p className="text-2xl">No class is open for check-in right now.</p>
          {later.length > 0 ? (
            <ul className="flex flex-col gap-2 text-lg">
              {later.map((s) => (
                <li key={s.classId} className="rounded-md border p-4">
                  <span className="font-medium">{s.name}</span> at {formatClassTime(s.startTime)} ·
                  check-in opens {minutesToTime(s.opens)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-muted-foreground">No more classes today.</p>
          )}
          {off.map((s) => (
            <p key={s.classId} className="text-lg text-muted-foreground">
              {s.name} is {s.status === "cancelled" ? "cancelled" : "moved"} today
              {s.note ? ` · ${s.note}` : ""}.
            </p>
          ))}
        </div>
      </>,
    );
  }

  if (!activeSession) {
    return shell(
      <>
        {header}
        <section className="flex flex-col gap-3" aria-labelledby="pick-class">
          <h2 id="pick-class" className="text-2xl">
            Which class?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {openSessions.map((s) => (
              <Button
                key={s.classId}
                variant="outline"
                className="h-auto min-h-20 flex-col items-start gap-1 p-4 text-left"
                onClick={() => setClassId(s.classId)}
              >
                <span className="text-2xl font-medium">{s.name}</span>
                <span className="text-lg text-muted-foreground">
                  {formatClassTime(s.startTime)}
                </span>
              </Button>
            ))}
          </div>
        </section>
      </>,
    );
  }

  if (selected) {
    return shell(
      <>
        {header}
        <section
          className="m-auto flex w-full max-w-lg flex-col gap-5 rounded-lg border p-6 text-center"
          aria-labelledby="confirm-heading"
        >
          <h2 id="confirm-heading" className="text-3xl">
            Check in <span className="font-semibold">{selected.name}</span>?
          </h2>
          <div className="flex justify-center">
            <BeltDisplay belt={selected.belt} stripes={selected.stripes} size="lg" showLabel />
          </div>
          <p className="text-xl text-muted-foreground">
            {activeSession.name} · {formatClassTime(activeSession.startTime)}
          </p>
          {confirmError ? (
            <p role="alert" className="text-lg text-destructive">
              {confirmError}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button className="h-16 flex-1 text-xl" onClick={confirm} disabled={submitting}>
              {submitting ? "Checking in..." : "Yes, check me in"}
            </Button>
            <Button
              variant="outline"
              className="h-16 flex-1 text-xl"
              onClick={() => {
                setSelected(null);
                setConfirmError(null);
              }}
              disabled={submitting}
            >
              That&apos;s not me
            </Button>
          </div>
        </section>
      </>,
    );
  }

  return shell(
    <>
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-2xl">
          {activeSession.name} · {formatClassTime(activeSession.startTime)}
        </p>
        {openSessions.length > 1 ? (
          <Button
            variant="outline"
            className="h-12 text-lg"
            onClick={() => {
              setClassId(null);
              resetFlow();
            }}
          >
            Change class
          </Button>
        ) : null}
      </div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Search your name"
          placeholder="Search your name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-14 pl-12 text-xl"
          autoComplete="off"
        />
      </div>
      {visibleMembers.length === 0 ? (
        <p className="text-lg text-muted-foreground">
          No one called &ldquo;{query}&rdquo;. Ask a coach to add you.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleMembers.map((m) => {
            const done = checkedInHere.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={done}
                  aria-label={done ? `${m.name}, already checked in` : `Check in ${m.name}`}
                  onClick={() => setSelected(m)}
                  className={cn(
                    "flex min-h-16 w-full items-center justify-between gap-3 rounded-md border p-4 text-left text-xl transition-colors",
                    done ? "bg-muted text-muted-foreground" : "hover:bg-accent active:bg-accent",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-2">
                    <span className="truncate font-medium">{m.name}</span>
                    <BeltDisplay belt={m.belt} stripes={m.stripes} size="sm" />
                  </span>
                  {done ? (
                    <span className="flex shrink-0 items-center gap-1 text-base">
                      <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
                      In
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>,
  );
}
