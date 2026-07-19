"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
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

type PendingRequest = {
  id: string;
  requested_at: string;
  member_id: string;
  members: { first_name: string; last_name: string } | null;
};

export function GdprSection() {
  const queryClient = useQueryClient();
  const [executingId, setExecutingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pending-deletion-requests"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("deletion_requests")
        .select("id, requested_at, member_id, members(first_name, last_name)")
        .is("executed_at", null)
        .order("requested_at", { ascending: true });
      if (error) throw error;
      return data as unknown as PendingRequest[];
    },
  });

  async function handleExecute(id: string) {
    setExecutingId(id);
    try {
      const res = await fetch(`/api/deletion-requests/${id}/execute`, { method: "POST" });
      if (res.ok) {
        toast.success("Member data deleted.");
        queryClient.invalidateQueries({ queryKey: ["pending-deletion-requests"] });
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Something went wrong — the deletion wasn't completed.");
      }
    } finally {
      setExecutingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">GDPR — pending deletion requests</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No pending requests"
          description="When an athlete requests account deletion, it'll show up here for you to review."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {row.members
                    ? `${row.members.first_name} ${row.members.last_name}`
                    : "Unknown member"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Requested {format(new Date(row.requested_at), "MMM d, yyyy")}
                </span>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="h-11" disabled={executingId === row.id}>
                    {executingId === row.id ? "Deleting..." : "Execute deletion"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete{" "}
                      {row.members
                        ? `${row.members.first_name} ${row.members.last_name}`
                        : "this member"}
                      &apos;s data?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes their MatOS login (they won&apos;t be able to sign in
                      again), anonymises their profile, permanently deletes their attendance, logs,
                      and video analyses, and anonymises payment/audit records. This can&apos;t be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="h-11" onClick={() => handleExecute(row.id)}>
                      Execute deletion
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
