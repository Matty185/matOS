"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Award, Search } from "lucide-react";
import {
  type BeltColor,
  type PromotionRule,
  type Readiness,
  type ReadinessStatus,
} from "@matos/shared";
import { BeltDisplay } from "@/components/shared/belt-display";
import { EmptyState } from "@/components/shared/empty-state";
import { PromoteBeltDialog } from "@/components/shared/promote-belt-dialog";
import { PromotionRulesForm } from "@/components/shared/promotion-rules-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PromotionRow = {
  id: string;
  name: string;
  belt: BeltColor;
  stripes: number;
  isStaff: boolean;
  /** Last promotion (or starting-rank) date, formatted in the gym zone. */
  sinceLabel: string | null;
  lastIsInitial: boolean;
  readiness: Readiness;
};

type Filter = "ready" | "close" | "all";

const STATUS_ORDER: Record<ReadinessStatus, number> = {
  ready: 0,
  close: 1,
  not_yet: 2,
  not_applicable: 3,
};

function overallProgress(r: Readiness) {
  const parts = [r.classesProgress, r.monthsProgress].filter((p): p is number => p !== null);
  return parts.length ? Math.min(...parts) : 0;
}

function ruleSummary(rule: PromotionRule) {
  const parts = [
    rule.classesPerStripe ? `${rule.classesPerStripe} classes` : null,
    rule.monthsPerStripe
      ? `${rule.monthsPerStripe} month${rule.monthsPerStripe === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} since their last promotion` : "No guidance set";
}

export function PromotionsList({
  rows,
  rule,
  canEditRule,
  loadFailed,
}: {
  rows: PromotionRow[];
  rule: PromotionRule;
  canEditRule: boolean;
  loadFailed: boolean;
}) {
  const counts = useMemo(
    () => ({
      ready: rows.filter((r) => r.readiness.status === "ready").length,
      close: rows.filter((r) => r.readiness.status === "close").length,
    }),
    [rows],
  );
  const [filter, setFilter] = useState<Filter>(counts.ready > 0 ? "ready" : "all");
  const [search, setSearch] = useState("");
  const [editingRule, setEditingRule] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "all" ? true : r.readiness.status === filter))
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.readiness.status] - STATUS_ORDER[b.readiness.status] ||
          overallProgress(b.readiness) - overallProgress(a.readiness) ||
          a.name.localeCompare(b.name),
      );
  }, [rows, filter, search]);

  const ruleOff = !rule.classesPerStripe && !rule.monthsPerStripe;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl tracking-wide">Promotions</h1>
        <p className="text-sm text-muted-foreground">
          Ready for the next stripe: {ruleSummary(rule)}. Belt changes are always your call.
          {canEditRule && !editingRule ? (
            <Button
              variant="link"
              className="ml-1 h-auto min-h-11 p-0 align-baseline"
              onClick={() => setEditingRule(true)}
            >
              Change
            </Button>
          ) : null}
        </p>
      </div>

      {editingRule ? (
        <div className="rounded-md border p-4">
          <PromotionRulesForm
            classesPerStripe={rule.classesPerStripe}
            monthsPerStripe={rule.monthsPerStripe}
            onSaved={() => setEditingRule(false)}
          />
        </div>
      ) : null}

      {loadFailed ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 p-3 text-sm text-destructive"
        >
          Couldn&apos;t load class counts, so nobody is shown as ready. Try refreshing.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(
            [
              ["ready", `Ready (${counts.ready})`],
              ["close", `Close (${counts.close})`],
              ["all", `Everyone (${rows.length})`],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              aria-pressed={filter === value}
              variant={filter === value ? "default" : "outline"}
              className="h-11"
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            aria-label="Search members"
            className="h-11 pl-9"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Award}
          title={
            search
              ? "No one matches that name"
              : filter === "ready"
                ? "No one is ready yet"
                : filter === "close"
                  ? "No one is close yet"
                  : "No active members"
          }
          description={
            ruleOff
              ? "Set classes or months per stripe to see who's due a promotion."
              : filter === "all"
                ? "Add members to track their progress here."
                : "Progress builds as members check in to classes."
          }
          actionLabel={filter !== "all" && !search ? "Show everyone" : undefined}
          onAction={filter !== "all" && !search ? () => setFilter("all") : undefined}
        />
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {visible.map((row) => (
            <PromotionItem key={row.id} row={row} rule={rule} />
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ readiness }: { readiness: Readiness }) {
  if (readiness.status === "ready") return <Badge>Ready</Badge>;
  if (readiness.status === "close") return <Badge variant="secondary">Close</Badge>;
  if (readiness.status === "not_yet") return <Badge variant="outline">Not yet</Badge>;
  if (readiness.reason === "belt_change") return <Badge variant="outline">Belt: your call</Badge>;
  return null;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className={`h-full rounded-full ${value >= 1 ? "bg-primary" : "bg-primary/50"}`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function PromotionItem({ row, rule }: { row: PromotionRow; rule: PromotionRule }) {
  const r = row.readiness;

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/members/${row.id}`} className="truncate font-medium hover:underline">
            {row.name}
          </Link>
          <StatusBadge readiness={r} />
          {row.isStaff ? <Badge variant="outline">Staff</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <BeltDisplay belt={row.belt} stripes={row.stripes} size="sm" showLabel />
          {r.nextStep ? <span>Next: {r.nextStep}</span> : null}
        </div>
        {r.reason !== "black_belt" && r.reason !== "belt_change" ? (
          <div className="grid max-w-md grid-cols-1 gap-2 pt-1 text-xs text-muted-foreground sm:grid-cols-2">
            {rule.classesPerStripe ? (
              <div className="flex flex-col gap-1">
                <span>
                  {r.classesSince} / {rule.classesPerStripe} classes
                </span>
                <ProgressBar
                  value={r.classesProgress ?? 0}
                  label={`${row.name}: ${r.classesSince} of ${rule.classesPerStripe} classes`}
                />
              </div>
            ) : (
              <span>{r.classesSince} classes</span>
            )}
            {rule.monthsPerStripe && r.monthsProgress !== null ? (
              <div className="flex flex-col gap-1">
                <span>
                  {r.monthsSince} / {rule.monthsPerStripe} months
                </span>
                <ProgressBar
                  value={r.monthsProgress ?? 0}
                  label={`${row.name}: ${r.monthsSince} of ${rule.monthsPerStripe} months`}
                />
              </div>
            ) : rule.monthsPerStripe ? (
              <span>Months: not counted until their first promotion in MatOS</span>
            ) : (
              <span>{r.monthsSince} months</span>
            )}
          </div>
        ) : null}
        {row.sinceLabel ? (
          <span className="text-xs text-muted-foreground">
            {row.lastIsInitial
              ? `Rank set when added (joined ${row.sinceLabel}) — classes recorded in MatOS`
              : `Last promoted ${row.sinceLabel}`}
          </span>
        ) : null}
      </div>
      {r.suggested ? (
        <div className="shrink-0">
          <PromoteBeltDialog
            memberId={row.id}
            currentBelt={row.belt}
            currentStripes={row.stripes}
            suggestedBelt={r.suggested.belt}
            suggestedStripes={r.suggested.stripes}
            triggerLabel={`Promote to ${r.nextStep}`}
            triggerVariant={r.status === "ready" ? "default" : "outline"}
          />
        </div>
      ) : null}
    </li>
  );
}
