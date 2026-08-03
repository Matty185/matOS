import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
};

/**
 * Shared empty-state shape per CLAUDE.md UI Standards ("proper empty states
 * with an action on every list view"). Stage 3 wires this into every
 * placeholder route ahead of the real data-fetching each module adds in
 * Stages 4-8 — the pattern and component are established now so later
 * stages just supply real query state instead of re-deriving the layout.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel ? (
        <Button
          className="mt-2 h-11"
          onClick={onAction}
          disabled={!onAction && !actionHref}
          asChild={Boolean(actionHref)}
        >
          {actionHref ? <a href={actionHref}>{actionLabel}</a> : actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
