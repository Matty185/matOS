"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { ClassFormDialog } from "@/components/shared/class-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { Database } from "@matos/shared";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CLASS_TYPE_LABELS: Record<ClassRow["class_type"], string> = {
  gi: "Gi",
  no_gi: "No-Gi",
  comp: "Comp",
  open_mat: "Open Mat",
};

function formatTime(time: string) {
  // "HH:MM:SS" (Postgres time) -> "H:MM AM/PM"
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = parts[1] ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

function useClasses() {
  return useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("classes")
        .select("*")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export default function ClassesPage() {
  const { data: classes, isLoading, error } = useClasses();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const groups: ClassRow[][] = Array.from({ length: 7 }, () => []);
    for (const c of classes ?? []) {
      groups[c.day_of_week]?.push(c);
    }
    return groups;
  }, [classes]);

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["classes"] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (res.ok) {
        toast.success("Class deleted.");
        refetch();
      } else {
        toast.error(body.error ?? "Couldn't delete this class.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Classes</h1>
        <p className="text-sm text-muted-foreground">Loading classes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-3xl tracking-wide">Classes</h1>
        <p className="text-sm text-destructive">Couldn&apos;t load classes. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl tracking-wide">Classes</h1>
        <ClassFormDialog mode="create" onSaved={refetch} />
      </div>

      {!classes || classes.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No classes yet"
          description="Build your weekly schedule — gi, no-gi, comp, and open mat classes all live here."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {DAY_LABELS.map((dayLabel, dayIndex) => {
            const dayClasses = byDay[dayIndex] ?? [];
            if (dayClasses.length === 0) return null;
            return (
              <div key={dayIndex} className="flex flex-col gap-2">
                <h2 className="text-lg font-medium">{dayLabel}</h2>
                <ul className="flex flex-col gap-2">
                  {dayClasses.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="outline">{CLASS_TYPE_LABELS[c.class_type]}</Badge>
                          {!c.active ? <Badge variant="secondary">Inactive</Badge> : null}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatTime(c.start_time)} · {c.duration_minutes} min
                          {c.max_capacity ? ` · max ${c.max_capacity}` : ""}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <ClassFormDialog
                          mode="edit"
                          classId={c.id}
                          defaultValues={{
                            name: c.name,
                            class_type: c.class_type,
                            day_of_week: c.day_of_week,
                            start_time: c.start_time.slice(0, 5),
                            duration_minutes: c.duration_minutes,
                            max_capacity: c.max_capacity,
                            active: c.active,
                          }}
                          onSaved={refetch}
                        />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="h-11">
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                If this class has any attendance history, deletion will be blocked —
                                deactivate it instead via Edit.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="h-11"
                                disabled={deletingId === c.id}
                                onClick={() => handleDelete(c.id)}
                              >
                                {deletingId === c.id ? "Deleting..." : "Delete"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
