"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ProfileSubject } from "@/lib/analysis/use-athlete-profile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function useExternalPeople(enabled: boolean) {
  return useQuery({
    queryKey: ["external-people"],
    enabled,
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

// Plan §6: "'Compare' action -> pick second athlete/external person ->
// side-by-side." Subject A is whichever profile the user is already
// viewing; this dialog only picks subject B, then hands both off to
// /analysis/compare via the URL (query params, not component state — the
// comparison screen needs to be a plain shareable/reloadable link, same
// reasoning every other Analysis route already uses real routes rather
// than client-only view state).
export function ComparePickerDialog({ subjectA }: { subjectA: ProfileSubject }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"member" | "external">("member");
  const [selectedId, setSelectedId] = useState("");

  const { data: members } = useGymMembers(open && kind === "member");
  const { data: externalPeople } = useExternalPeople(open && kind === "external");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setKind("member");
      setSelectedId("");
    }
  }

  function handleCompare() {
    if (!selectedId) return;
    const params = new URLSearchParams({
      aType: subjectA.type,
      aId: subjectA.id,
      bType: kind,
      bId: selectedId,
    });
    router.push(`/analysis/compare?${params.toString()}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11">
          <GitCompareArrows className="mr-2 h-4 w-4" /> Compare
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compare profiles</DialogTitle>
          <DialogDescription>Pick who to compare this profile against.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Compare against</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={kind === "member" ? "default" : "outline"}
                className="h-11"
                onClick={() => {
                  setKind("member");
                  setSelectedId("");
                }}
              >
                A gym member
              </Button>
              <Button
                type="button"
                variant={kind === "external" ? "default" : "outline"}
                className="h-11"
                onClick={() => {
                  setKind("external");
                  setSelectedId("");
                }}
              >
                External person
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Who</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pick someone" />
              </SelectTrigger>
              <SelectContent>
                {kind === "member"
                  ? (members ?? [])
                      .filter((m) => !(subjectA.type === "member" && subjectA.id === m.id))
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.first_name} {m.last_name}
                        </SelectItem>
                      ))
                  : (externalPeople ?? [])
                      .filter((p) => !(subjectA.type === "external" && subjectA.id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name}
                        </SelectItem>
                      ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" className="h-11" disabled={!selectedId} onClick={handleCompare}>
            Compare
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
