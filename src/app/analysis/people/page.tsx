"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { ExternalPersonFormDialog } from "@/components/shared/external-person-form-dialog";
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

type ExternalPerson = { id: string; display_name: string; notes: string | null };

export default function ExternalPeoplePage() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data: people,
    isLoading,
    error: peopleError,
  } = useQuery({
    queryKey: ["external-people"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_people")
        .select("id, display_name, notes")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data as ExternalPerson[];
    },
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: ["external-people"] });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/external-people/${id}`, { method: "DELETE" });
      const body = await res.json();
      if (res.ok) {
        toast.success("Person deleted.");
        refetch();
      } else {
        toast.error(body.error ?? "Couldn't delete this person.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/analysis"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back to breakdowns
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-3xl tracking-wide">External People</h1>
        <ExternalPersonFormDialog mode="create" onSaved={refetch} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : peopleError ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load external people. Try refreshing.
        </p>
      ) : !people || people.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No external people yet"
          description="Add training partners or opponents who don't have a MatOS account, so you can log matches about them."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex flex-col gap-0.5">
                <Link href={`/analysis/people/${p.id}`} className="font-medium hover:underline">
                  {p.display_name}
                </Link>
                {p.notes ? <span className="text-sm text-muted-foreground">{p.notes}</span> : null}
              </div>
              <div className="flex gap-2">
                <ExternalPersonFormDialog
                  mode="edit"
                  personId={p.id}
                  defaultValues={{ display_name: p.display_name, notes: p.notes ?? "" }}
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
                      <AlertDialogTitle>Delete {p.display_name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        If this person has any logged matches, deletion will be blocked.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="h-11"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                      >
                        {deletingId === p.id ? "Deleting..." : "Delete"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
