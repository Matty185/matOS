import type { Metadata } from "next";
import {
  formatPct,
  formatRate,
  humanize,
  RESULT_LABELS,
  METHOD_LABELS,
  type MetricValue,
} from "@matos/shared";
import {
  resolveShareLink,
  pickPrimaryStyle,
  type ResolvedProfileShare,
  type ResolvedBreakdownShare,
} from "@/lib/share/resolve-share-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BeltDisplay } from "@/components/shared/belt-display";

// Live-testing (part of this stage's own security-fix re-verification)
// caught this route being statically cached by Next's default full-route
// cache: response times dropped from ~150-1100ms on first fetch to
// 20-70ms on repeat fetches to the *same* token, and re-fetching after
// changing the underlying data server-side returned byte-identical stale
// HTML. That's a real bug independent of anything else in this diff — a
// revoked share link (or a redaction change) must stop reflecting on the
// public page immediately, not whenever Next next decides to
// invalidate the cache. `resolveShareLink()` never touches
// cookies/headers, so nothing here otherwise signals Next to opt out of
// static rendering. Forced explicitly on both this page and the sibling
// opengraph-image.tsx route.
export const dynamic = "force-dynamic";

// Per-token metadata (title/description), not the static export this
// started as — a code-reviewer finding: a static export can't vary by
// share kind, so every profile share's link preview described itself as
// "A BJJ match breakdown" regardless.
export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const share = await resolveShareLink(params.token);
  if (!share) return { title: "MatOS" };
  return share.kind === "profile"
    ? {
        title: `${share.displayName} — MatOS`,
        description: `${share.displayName}'s BJJ stats, tracked with MatOS.`,
      }
    : { title: `${share.name} — MatOS`, description: `A BJJ match breakdown, shared via MatOS.` };
}

function Unavailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="font-heading text-3xl tracking-wide text-primary">MatOS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This share link isn&apos;t valid — it may have been revoked or never existed.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

// Every metric renders its n (Non-Negotiable #6), same as the
// authenticated ProfileView's MetricRow — a code-review finding: this was
// initially dropped for the condensed public card, but "100%" reading as
// exactly that fragile on n=1 matters *more*, not less, on the one page a
// stranger might see with no other context.
function StatRow({
  label,
  metric,
  format = "pct",
}: {
  label: string;
  metric: MetricValue;
  format?: "pct" | "rate";
}) {
  const formatted = format === "pct" ? formatPct(metric.value) : formatRate(metric.value);
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">
        {formatted} <span className="text-xs text-muted-foreground">(n={metric.n})</span>
      </span>
    </div>
  );
}

function ProfileCard({ share }: { share: ResolvedProfileShare }) {
  const { profile: stats, label: styleLabel } = pickPrimaryStyle(share);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-heading text-lg tracking-wide text-primary">MatOS</p>
          <div className="flex items-center gap-3">
            <CardTitle className="text-2xl">{share.displayName}</CardTitle>
            {share.belt ? <BeltDisplay belt={share.belt} stripes={share.stripes ?? 0} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {stats.matchCount} {stats.matchCount === 1 ? "match" : "matches"} logged · {styleLabel}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-0">
          <StatRow label="Win rate" metric={stats.general.winRate} />
          <StatRow
            label="Submission attempts / match"
            metric={stats.submissions.attemptsPerMatch}
            format="rate"
          />
          <StatRow label="Submission finish rate" metric={stats.submissions.finishPctOverall} />
          <StatRow label="Takedown success" metric={stats.wrestling.takedownSuccessPct} />
          <StatRow label="Sweep %" metric={stats.guard.sweepPct} />
          {stats.submissions.topByFrequency.length > 0 ? (
            <div className="pt-3">
              <p className="text-xs font-medium text-muted-foreground">Top submissions</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {stats.submissions.topByFrequency.slice(0, 3).map((s) => (
                  <Badge key={s.type} variant="outline">
                    {humanize(s.type)} ({s.count})
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Tracked with MatOS</p>
    </main>
  );
}

function BreakdownCard({ share }: { share: ResolvedBreakdownShare }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-heading text-lg tracking-wide text-primary">MatOS</p>
          <CardTitle className="text-2xl">{share.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {share.focusDisplayName} ·{" "}
            {new Date(share.matchDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">{share.gi ? "Gi" : "No-Gi"}</Badge>
          {share.result ? <Badge variant="outline">{RESULT_LABELS[share.result]}</Badge> : null}
          {share.method ? <Badge variant="outline">{METHOD_LABELS[share.method]}</Badge> : null}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Tracked with MatOS</p>
    </main>
  );
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const share = await resolveShareLink(params.token);

  if (!share) return <Unavailable />;

  return share.kind === "profile" ? <ProfileCard share={share} /> : <BreakdownCard share={share} />;
}
