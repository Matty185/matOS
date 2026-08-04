import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { resolveShareLink, pickPrimaryStyle } from "@/lib/share/resolve-share-link";
import { formatPct } from "@matos/shared";

export const runtime = "nodejs";
export const alt = "MatOS";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Same reasoning as page.tsx's own `dynamic` export — this route resolves
// a token per-request too, and a revoked link's OG image must stop
// reflecting the old data immediately.
export const dynamic = "force-dynamic";

// Stage S3: Next's opengraph-image.tsx convention — automatically wires
// this into the page's <meta property="og:image"> tags (so pasting a
// share link into iMessage/Twitter/Slack shows a rich preview) and is
// independently fetchable at its own URL, satisfying "share image
// generation" without a second, hand-rolled meta-tag/route pair. Reuses
// resolveShareLink() (same resolution + redaction logic the page itself
// uses) rather than re-deriving anything — a revoked/invalid token gets a
// generic MatOS placeholder image rather than an error, since a broken-
// looking link preview is worse than a blank-but-branded one.
//
// Fonts are loaded from local files, not next/og's default bundled font —
// found live: the bundled @vercel/og font-loading path constructs an
// invalid file:// URL on Windows ("TypeError: Invalid URL" ->
// "failed to pipe response", every request, regardless of whether custom
// fonts are supplied — confirmed by testing both with and without this
// file's own `fonts` option). Matches a known, confirmed-Windows-only
// upstream bug (vercel/next.js#77164 — the vendored code path-joins
// `import.meta.url` instead of using the URL constructor; reporter
// confirms it "works correctly on other platforms," i.e. Vercel's Linux
// production runtime). Not fixable from application code (the bug is in
// next's own vendored, unpatchable-from-here @vercel/og build) and not
// worth a Next version bump to chase (the linked issue reproduces on a
// 15.2.2-canary build too, so it isn't specific to the 14.2.35 pin this
// project is on). These two local .ttf files exist so the *rendering*
// itself (the part this stage is actually responsible for) is correct
// regardless — this route is expected to work in production even though
// it cannot be exercised in this Windows local-dev environment; verify
// against the real deployment once pushed, not just locally.
const fontsDir = join(process.cwd(), "src/app/share/fonts");

async function loadFonts() {
  const [regular, bold] = await Promise.all([
    readFile(join(fontsDir, "inter-regular.ttf")),
    readFile(join(fontsDir, "inter-bold.ttf")),
  ]);
  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

export default async function Image({ params }: { params: { token: string } }) {
  const [share, fonts] = await Promise.all([resolveShareLink(params.token), loadFonts()]);

  const navy = "#1B4F72";

  if (!share) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: navy,
          color: "white",
          fontSize: 64,
          fontWeight: 700,
          fontFamily: "Inter",
        }}
      >
        MatOS
      </div>,
      { ...size, fonts },
    );
  }

  const primary = share.kind === "profile" ? pickPrimaryStyle(share) : null;
  const heading = share.kind === "profile" ? share.displayName : share.name;
  const subheading =
    share.kind === "profile" && primary
      ? `${primary.profile.matchCount} matches logged`
      : share.kind === "breakdown"
        ? share.focusDisplayName
        : "";
  const stat =
    share.kind === "profile" && primary
      ? `Win rate ${formatPct(primary.profile.general.winRate.value)}`
      : share.kind === "breakdown"
        ? `${share.gi ? "Gi" : "No-Gi"}${share.result ? ` · ${share.result}` : ""}`
        : "";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: navy,
        color: "white",
        padding: 64,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>MatOS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>{heading}</div>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 400, opacity: 0.85 }}>
          {subheading}
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 700, marginTop: 16 }}>{stat}</div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
