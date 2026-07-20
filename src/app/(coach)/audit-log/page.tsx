"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { resolveAuditNames, describeAuditEntry, type AuditLogRow } from "@/lib/audit/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ENTRY_LIMIT = 200;

function useAuditLog() {
  return useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(ENTRY_LIMIT);
      if (error) throw error;

      const rows = (data ?? []) as AuditLogRow[];
      const names = await resolveAuditNames(supabase, rows);
      return rows.map((row) => ({
        row,
        description: describeAuditEntry(row, names),
        actorName: row.actor_id ? (names.byUserId.get(row.actor_id) ?? "A former member") : null,
      }));
    },
  });
}

// Last 200 entries, filterable (date/actor/action), plain-English actions —
// per plan §7. Filtering is client-side over the fetched 200, matching the
// same pattern the members/payments pages already use (no server round-
// trip per filter change) — 200 rows is a small, bounded dataset.
export default function AuditLogPage() {
  const { data, isLoading, error } = useAuditLog();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const actorOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((e) => e.actorName).filter((n): n is string => !!n))).sort();
  }, [data]);

  const actionOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map((e) => e.row.action))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(({ row, actorName }) => {
      if (actorFilter !== "all" && actorName !== actorFilter) return false;
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      const day = row.timestamp.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
  }, [data, actorFilter, actionFilter, fromDate, toDate]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl tracking-wide">Audit Log</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="audit-from"
            type="date"
            className="h-11 w-40"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="audit-to"
            type="date"
            className="h-11 w-40"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="h-11 w-48">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {actorOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-11 w-56">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actionOptions.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load the audit log. Try refreshing.
        </p>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No activity recorded yet"
          description="Every change made in MatOS — by you, your coaches, or the assistant — will be logged here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No matching entries"
          description="Try a different date range, actor, or action."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(({ row, description }) => (
            <li key={row.id} className="flex flex-col gap-0.5 rounded-md border p-3 text-sm">
              <span>{description}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(row.timestamp), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
