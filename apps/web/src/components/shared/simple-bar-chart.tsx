"use client";

import { useState } from "react";

export type Bar = { key: string; label: string; value: number; display: string };

// Flow audit 10.4: one series, one hue (the primary navy) — no palette to
// validate. Thin bars with 4px rounded tops anchored to the baseline and a
// 2px gap. Bars show their value on hover; the chart is one labelled image
// for screen readers, and "Show as table" gives every value as text (bars
// are too narrow on a phone to be tap targets).
export function SimpleBarChart({
  bars,
  title,
  height = 140,
}: {
  bars: Bar[];
  title: string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const current = bars.find((b) => b.key === active) ?? null;
  const peak = bars.reduce<Bar | null>((a, b) => (!a || b.value > a.value ? b : a), null);

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-medium">{title}</figcaption>
        <button
          type="button"
          className="h-11 text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {bars.every((b) => b.value === 0) ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nothing recorded in this period yet.
        </p>
      ) : asTable ? (
        <table className="w-full text-sm">
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-b last:border-0">
                <td className="py-1.5 text-muted-foreground">{b.label}</td>
                <td className="py-1.5 text-right tabular-nums">{b.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="h-5 text-sm tabular-nums text-muted-foreground" aria-hidden="true">
            {current ? `${current.label}: ${current.display}` : `Highest: ${peak?.display ?? "0"}`}
          </p>
          <div
            className="flex items-end gap-[2px] border-b border-border"
            style={{ height }}
            role="img"
            aria-label={`${title}. Highest: ${peak?.label ?? ""}, ${peak?.display ?? "0"}. Use "Show as table" for every value.`}
          >
            {bars.map((b) => (
              <div
                key={b.key}
                className="flex h-full flex-1 items-end"
                onMouseEnter={() => setActive(b.key)}
                onMouseLeave={() => setActive(null)}
                title={`${b.label}: ${b.display}`}
              >
                <span
                  className={`block w-full rounded-t-[4px] bg-primary transition-opacity ${
                    active && active !== b.key ? "opacity-50" : ""
                  }`}
                  style={{ height: `${Math.max(b.value > 0 ? 2 : 0, (b.value / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
            <span>{bars[0]?.label}</span>
            <span>{bars[bars.length - 1]?.label}</span>
          </div>
        </div>
      )}
    </figure>
  );
}
