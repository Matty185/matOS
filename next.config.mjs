import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

// Stage 11 security review flagged script-src's 'unsafe-eval' as
// unnecessarily weakening the CSP as an XSS mitigation layer (no
// dangerouslySetInnerHTML/innerHTML sink exists in this app today, so
// nothing currently exploits it, but it removes CSP as a defense-in-depth
// backstop if one is ever introduced). 'unsafe-eval' is only actually
// needed by webpack's eval-based devtool in `next dev` (HMR/fast refresh);
// a production build's client bundle never calls eval(). Dropping it in
// production is a safe, low-risk tightening verified against a real
// production build + browser session. 'unsafe-inline' stays for both —
// removing it requires a nonce threaded through Next's own framework-
// injected RSC hydration scripts, which is a larger, riskier change to make
// this close to a demo without live framework-doc access to verify the
// exact Next 14.2 wiring; tracked as an accepted gap, not silently dropped
// (see CLAUDE.md Decision Log).
const nextConfig = {
  async headers() {
    const scriptSrc =
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: *.supabase.co",
              // media-src covers <video>/<source> — falls back to
              // default-src ('self' only) without this, which silently
              // blocks the manual analysis player's blob: video playback
              // (the video is deliberately never uploaded anywhere, loaded
              // client-side only via URL.createObjectURL).
              "media-src 'self' blob:",
              "font-src 'self' data:",
              "connect-src 'self' *.supabase.co wss://*.supabase.co api.anthropic.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
