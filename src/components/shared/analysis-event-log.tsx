"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_LABELS, formatEventTimestamp } from "@/lib/analysis/labels";
import type { AnalysisEventType } from "@/lib/analysis/stats";

export type AnalysisEventForDisplay = {
  id: string;
  event_type: AnalysisEventType;
  timestamp_seconds: number;
  duration_seconds: number | null;
  notes: string | null;
};

// Plain chronological list, no external timeline library — matches
// attendance-calendar.tsx's "this is the only calendar in the app so far"
// reasoning applied to timelines. Shared between the AI-stub result view
// and the manual player's live event list; onDelete is only wired up where
// editing makes sense (omit it for a read-only view).
export function AnalysisEventLog({
  events,
  onDelete,
}: {
  events: AnalysisEventForDisplay[];
  onDelete?: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events logged yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
        >
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                {formatEventTimestamp(event.timestamp_seconds)}
              </span>
              <span className="font-medium">{EVENT_TYPE_LABELS[event.event_type]}</span>
              {event.duration_seconds ? (
                <Badge variant="outline">{event.duration_seconds}s</Badge>
              ) : null}
            </div>
            {event.notes ? <p className="text-muted-foreground">{event.notes}</p> : null}
          </div>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Delete event"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
