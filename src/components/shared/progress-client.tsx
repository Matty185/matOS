"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, differenceInCalendarWeeks } from "date-fns";
import { CalendarCheck, Award, NotebookText, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { athleteLogSchema, type AthleteLogInput } from "@/lib/validation/account";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

type LogRow = {
  id: string;
  entry_date: string;
  working_on: string | null;
  struggling_with: string | null;
  notes: string | null;
  visible_to_coach: boolean;
};

export function ProgressClient({ memberId, joinDate }: { memberId: string; joinDate: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">My Progress</h1>
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="belts">Belt History</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab memberId={memberId} joinDate={joinDate} />
        </TabsContent>
        <TabsContent value="belts" className="pt-4">
          <BeltHistoryTab memberId={memberId} />
        </TabsContent>
        <TabsContent value="logs" className="pt-4">
          <LogsTab memberId={memberId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendanceTab({ memberId, joinDate }: { memberId: string; joinDate: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["my-attendance", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("attendance")
        .select("checked_in_at, checked_in_by")
        .eq("member_id", memberId)
        .order("checked_in_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No attendance recorded yet"
        description="Check in to a class and your history will show up here."
      />
    );
  }

  const weeksSinceJoin = Math.max(1, differenceInCalendarWeeks(new Date(), new Date(joinDate)));
  const avgPerWeek = (data.length / weeksSinceJoin).toFixed(1);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-3">
        <p className="text-xs text-muted-foreground">Average per week</p>
        <p className="text-2xl font-semibold">{avgPerWeek}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {data.map((row, i) => (
          <li key={i} className="flex justify-between rounded-md border p-3 text-sm">
            <span>{format(new Date(row.checked_in_at), "EEE, MMM d, yyyy 'at' h:mm a")}</span>
            <span className="text-muted-foreground">
              {row.checked_in_by === "self" ? "Self check-in" : "Marked by coach"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BeltHistoryTab({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["my-belt-history", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("belt_history")
        .select("belt, stripes, promoted_at, notes")
        .eq("member_id", memberId)
        .order("promoted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Award}
        title="No promotions recorded yet"
        description="Your belt promotions will appear here as a timeline."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {data.map((row, i) => (
        <li key={i} className="flex flex-col gap-1 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <BeltDisplay belt={row.belt} stripes={row.stripes} size="sm" showLabel />
            <span className="text-xs text-muted-foreground">
              {format(new Date(row.promoted_at), "MMM d, yyyy")}
            </span>
          </div>
          {row.notes ? <p className="text-sm text-muted-foreground">{row.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function LogsTab({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["my-logs", memberId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("athlete_logs")
        .select("id, entry_date, working_on, struggling_with, notes, visible_to_coach")
        .eq("member_id", memberId)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return data as LogRow[];
    },
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["my-logs", memberId] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/logs/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Entry deleted.");
        refetch();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Something went wrong.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <LogFormDialog mode="create" onSaved={refetch} />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={NotebookText}
          title="No log entries yet"
          description="Track what you're working on and struggling with after each session."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(`${row.entry_date}T00:00:00`), "MMM d, yyyy")}
                  {!row.visible_to_coach ? " · Private" : ""}
                </span>
                <div className="flex gap-1">
                  <LogFormDialog mode="edit" log={row} onSaved={refetch} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="h-11 w-11 p-0" aria-label="Delete entry">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                        <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="h-11"
                          disabled={deletingId === row.id}
                          onClick={() => handleDelete(row.id)}
                        >
                          {deletingId === row.id ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              {row.working_on ? <p className="text-sm">Working on: {row.working_on}</p> : null}
              {row.struggling_with ? (
                <p className="text-sm">Struggling with: {row.struggling_with}</p>
              ) : null}
              {row.notes ? <p className="text-sm text-muted-foreground">{row.notes}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type LogFormDialogProps =
  { mode: "create"; onSaved: () => void } | { mode: "edit"; log: LogRow; onSaved: () => void };

function LogFormDialog(props: LogFormDialogProps) {
  const isEdit = props.mode === "edit";
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AthleteLogInput>({
    resolver: zodResolver(athleteLogSchema),
    defaultValues: isEdit
      ? {
          entry_date: props.log.entry_date,
          working_on: props.log.working_on ?? "",
          struggling_with: props.log.struggling_with ?? "",
          notes: props.log.notes ?? "",
          visible_to_coach: props.log.visible_to_coach,
        }
      : {
          entry_date: new Date().toISOString().slice(0, 10),
          visible_to_coach: true,
        },
  });

  async function onSubmit(data: AthleteLogInput) {
    const url = isEdit ? `/api/logs/${props.log.id}` : "/api/logs";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Something went wrong.");
      return;
    }

    toast.success(isEdit ? "Entry updated." : "Entry added.");
    setOpen(false);
    if (!isEdit)
      reset({ entry_date: new Date().toISOString().slice(0, 10), visible_to_coach: true });
    props.onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="outline" className="h-11 w-11 p-0" aria-label="Edit entry">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="h-11 w-fit">Add log entry</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit entry" : "New log entry"}</DialogTitle>
          <DialogDescription>Track what you&apos;re working on after a session.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entry_date">Date</Label>
            <Input id="entry_date" type="date" className="h-11" {...register("entry_date")} />
            {errors.entry_date ? (
              <p className="text-sm text-destructive">{errors.entry_date.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="working_on">Working on</Label>
            <Input id="working_on" className="h-11" {...register("working_on")} />
            {errors.working_on ? (
              <p className="text-sm text-destructive">{errors.working_on.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="struggling_with">Struggling with</Label>
            <Input id="struggling_with" className="h-11" {...register("struggling_with")} />
            {errors.struggling_with ? (
              <p className="text-sm text-destructive">{errors.struggling_with.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} />
            {errors.notes ? (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            ) : null}
          </div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <Controller
              name="visible_to_coach"
              control={control}
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                />
              )}
            />
            Visible to my coach
          </label>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="h-11">
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
