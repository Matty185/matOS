"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { createBreakdownBaseSchema } from "@matos/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormValues = {
  name: string;
  match_date: string;
  gi: boolean;
  result?: "win" | "loss" | "draw";
};

const NEW_PERSON_VALUE = "__new__";

function useCurrentMember() {
  return useQuery({
    queryKey: ["current-member"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("members")
        .select("id, role, first_name, last_name")
        .eq("user_id", user.id)
        .single();
      return data;
    },
  });
}

function useGymMembers(enabled: boolean) {
  return useQuery({
    queryKey: ["gym-members-active"],
    enabled,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("active", true)
        .order("first_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useExternalPeople() {
  return useQuery({
    queryKey: ["external-people"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

// Metadata form only — plan §6's "→ file picker → tagging screen" step
// doesn't exist yet (that's Stage A3). Submitting here creates the
// breakdown row and lands on its (currently placeholder) detail page.
export default function NewBreakdownPage() {
  const router = useRouter();
  const { data: currentMember, isLoading: memberLoading } = useCurrentMember();
  const isStaff = currentMember?.role === "coach" || currentMember?.role === "gym_owner";

  // currentMember is undefined on first render whenever ["current-member"]
  // isn't already warm (any cold/direct load of this page, not just
  // navigating in from /analysis) — a useState initializer keyed on
  // isStaff would permanently lock focusMode to "self" in that case, even
  // once the role resolves, silently creating breakdowns about the wrong
  // person for a coach. Found in Stage A2 code review. Fixed by deriving
  // the default reactively, only until the user actually picks one
  // themselves.
  const [focusMode, setFocusMode] = useState<"self" | "member" | "external" | null>(null);
  const [focusModeTouched, setFocusModeTouched] = useState(false);

  useEffect(() => {
    if (focusModeTouched || !currentMember) return;
    setFocusMode(isStaff ? "member" : "self");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMember, isStaff, focusModeTouched]);

  function selectFocusMode(mode: "self" | "member" | "external") {
    setFocusModeTouched(true);
    setFocusMode(mode);
  }

  const [memberId, setMemberId] = useState<string>("");
  const [externalPersonId, setExternalPersonId] = useState<string>("");
  const [newPersonName, setNewPersonName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: gymMembers } = useGymMembers(focusMode === "member");
  const { data: externalPeople } = useExternalPeople();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting: formSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(
      createBreakdownBaseSchema.omit({ member_id: true, external_person_id: true }),
    ) as never,
    defaultValues: { match_date: format(new Date(), "yyyy-MM-dd"), gi: true },
  });

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    try {
      let resolvedExternalPersonId: string | null = null;

      if (focusMode === "external") {
        if (externalPersonId === NEW_PERSON_VALUE || !externalPersonId) {
          if (!newPersonName.trim()) {
            toast.error("Enter a name for the external person.");
            return;
          }
          const res = await fetch("/api/external-people", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ display_name: newPersonName.trim() }),
          });
          const body = await res.json();
          if (!res.ok) {
            toast.error(body.error ?? "Couldn't create that person.");
            return;
          }
          resolvedExternalPersonId = body.person.id;
        } else {
          resolvedExternalPersonId = externalPersonId;
        }
      } else if (focusMode === "member" && !memberId) {
        toast.error("Pick a member.");
        return;
      }

      const res = await fetch("/api/breakdowns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id:
            focusMode === "self"
              ? currentMember?.id
              : focusMode === "member"
                ? memberId
                : undefined,
          external_person_id: focusMode === "external" ? resolvedExternalPersonId : undefined,
          name: data.name,
          match_date: data.match_date,
          gi: data.gi,
          result: data.result || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Something went wrong.");
        return;
      }

      toast.success("Breakdown created.");
      router.push(`/analysis/${body.breakdown.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (memberLoading || !currentMember || focusMode === null) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Log a match</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label>Who is this about?</Label>
          <div className="flex flex-wrap gap-2">
            {!isStaff ? (
              <Button
                type="button"
                variant={focusMode === "self" ? "default" : "outline"}
                className="h-11"
                onClick={() => selectFocusMode("self")}
              >
                Myself
              </Button>
            ) : (
              <Button
                type="button"
                variant={focusMode === "member" ? "default" : "outline"}
                className="h-11"
                onClick={() => selectFocusMode("member")}
              >
                A gym member
              </Button>
            )}
            <Button
              type="button"
              variant={focusMode === "external" ? "default" : "outline"}
              className="h-11"
              onClick={() => selectFocusMode("external")}
            >
              External person
            </Button>
          </div>
        </div>

        {focusMode === "member" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick a member" />
              </SelectTrigger>
              <SelectContent>
                {(gymMembers ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.first_name} {m.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {focusMode === "external" ? (
          <div className="flex flex-col gap-1.5">
            <Label>External person</Label>
            <Select value={externalPersonId} onValueChange={setExternalPersonId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick or create a person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_PERSON_VALUE}>+ Create new person</SelectItem>
                {(externalPeople ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {externalPersonId === NEW_PERSON_VALUE ? (
              <Input
                className="h-11"
                placeholder="New person's name"
                value={newPersonName}
                onChange={(e) => setNewPersonName(e.target.value)}
              />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Title</Label>
          <Input
            id="name"
            className="h-11"
            placeholder="e.g. Sparring round vs blue belt"
            {...register("name")}
          />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="match_date">Match date</Label>
          <Input id="match_date" type="date" className="h-11" {...register("match_date")} />
          {errors.match_date ? (
            <p className="text-sm text-destructive">{errors.match_date.message}</p>
          ) : null}
        </div>

        <label className="flex h-11 items-center gap-2 text-sm">
          <Controller
            name="gi"
            control={control}
            render={({ field }) => (
              <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
            )}
          />
          Gi
        </label>

        <div className="flex flex-col gap-1.5">
          <Label>Result (optional)</Label>
          <Controller
            name="result"
            control={control}
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Not decided yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="win">Win</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                  <SelectItem value="draw">Draw</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <Button type="submit" className="h-11 self-start" disabled={formSubmitting || submitting}>
          {formSubmitting || submitting ? "Creating..." : "Create breakdown"}
        </Button>
      </form>
    </div>
  );
}
