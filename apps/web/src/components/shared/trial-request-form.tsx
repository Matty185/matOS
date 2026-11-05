"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  CLASS_PROGRAM_LABELS,
  TRIAL_EXPERIENCE_LABELS,
  TRIAL_EXPERIENCE_VALUES,
  formatClassTime,
  formatSessionDate,
  type TrialExperience,
} from "@matos/shared";
import type { TrialSession } from "@/lib/trials/public";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NOT_SURE = "not-sure";

const TYPE_LABELS: Record<TrialSession["classType"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open mat",
};

function sessionLabel(s: TrialSession): string {
  const program = s.program !== "all_levels" ? ` · ${CLASS_PROGRAM_LABELS[s.program]}` : "";
  return `${formatSessionDate(s.date)}, ${formatClassTime(s.startTime)} · ${s.name} (${TYPE_LABELS[s.classType]}${program})`;
}

// Flow audit 9.1: the public trial-request form. Plain controlled inputs
// (no auth, no React Query); the server re-validates everything.
export function TrialRequestForm({ code, sessions }: { code: string; sessions: TrialSession[] }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [experience, setExperience] = useState<TrialExperience | "">("");
  const [session, setSession] = useState<string>(NOT_SURE);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [hpField, setHpField] = useState(""); // honeypot
  const [forChild, setForChild] = useState(false);
  const [parentName, setParentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit =
    firstName.trim() &&
    lastName.trim() &&
    (email.trim() || phone.trim()) &&
    experience &&
    (!forChild || parentName.trim().length >= 2) &&
    consent &&
    !saving;

  async function submit() {
    setSaving(true);
    setError(null);
    const chosen = session === NOT_SURE ? null : sessions[Number(session)];
    try {
      const res = await fetch(`/api/trial/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          experience,
          message,
          class_id: chosen?.classId ?? "",
          session_date: chosen?.date ?? "",
          consent,
          for_child: forChild,
          parent_name: forChild ? parentName : "",
          hp_field: hpField,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Something went wrong — please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't reach the gym's system. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-3" role="status">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            Thanks{forChild ? `, ${parentName.trim()}` : `, ${firstName.trim()}`}! Your request has
            been sent.
          </p>
          <p className="text-sm text-muted-foreground">
            The gym will contact you to confirm your trial. Bring comfortable sportswear and water.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="trial-child"
          className="mt-0.5 h-5 w-5"
          checked={forChild}
          onCheckedChange={(v) => setForChild(v === true)}
        />
        <Label htmlFor="trial-child" className="font-normal leading-snug">
          This trial is for my child
        </Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-first">{forChild ? "Child's first name" : "First name"}</Label>
          <Input
            id="trial-first"
            className="h-11"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={50}
            autoComplete="given-name"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-last">{forChild ? "Child's last name" : "Last name"}</Label>
          <Input
            id="trial-last"
            className="h-11"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={50}
            autoComplete="family-name"
          />
        </div>
      </div>
      {forChild ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-parent">Your name (parent or guardian)</Label>
          <Input
            id="trial-parent"
            className="h-11"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            maxLength={100}
            autoComplete="name"
          />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-email">Email</Label>
          <Input
            id="trial-email"
            type="email"
            className="h-11"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="trial-phone">Phone</Label>
          <Input
            id="trial-phone"
            type="tel"
            className="h-11"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            autoComplete="tel"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {forChild ? "Your own email or phone. " : ""}An email or a phone number is enough.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          {forChild ? "Has your child trained before?" : "Have you trained before?"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {TRIAL_EXPERIENCE_VALUES.map((v) => (
            <Button
              key={v}
              type="button"
              variant={experience === v ? "default" : "outline"}
              className="h-11"
              aria-pressed={experience === v}
              onClick={() => setExperience(v)}
            >
              {TRIAL_EXPERIENCE_LABELS[v]}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="trial-session">Which class would you like to try?</Label>
        <Select value={session} onValueChange={setSession}>
          <SelectTrigger id="trial-session" className="h-auto min-h-11 text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-2rem)]">
            <SelectItem value={NOT_SURE}>Not sure yet — help me choose</SelectItem>
            {sessions.map((s, i) => (
              <SelectItem
                key={`${s.classId}-${s.date}`}
                value={String(i)}
                className="whitespace-normal"
              >
                {sessionLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No classes are listed for the next two weeks — the gym will suggest one.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="trial-message">Anything we should know? (optional)</Label>
        <Textarea
          id="trial-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          No medical details, please — you can tell the coach in person.
        </p>
      </div>

      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        {/* Named so browser autofill and password managers skip it. */}
        <label htmlFor="trial-hp">Leave this empty</label>
        <input
          id="trial-hp"
          name="hp_field"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={hpField}
          onChange={(e) => setHpField(e.target.value)}
        />
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="trial-consent"
          className="mt-0.5 h-5 w-5"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
        />
        <Label htmlFor="trial-consent" className="font-normal leading-snug">
          The gym may store these details and contact me about a trial. I can ask for them to be
          deleted at any time.
        </Label>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
        {saving ? "Sending..." : "Request a free trial"}
      </Button>
    </form>
  );
}
