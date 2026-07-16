import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Route groups like (coach)/(athlete) are invisible in the URL — they can't
// be matched by path, and Stage 3 hasn't decided the actual URL structure
// under them yet. So instead of guessing future protected paths, this is an
// allowlist of what's public; everything else defaults to requiring a
// session. New pages are protected automatically without editing this file.
const PUBLIC_PATHS = ["/login", "/invite"];
const PUBLIC_EXACT_PATHS = ["/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.includes(pathname)) return true;
  // Boundary-based, not a bare startsWith: a future route literally named
  // e.g. /logins or /invitexyz must not accidentally become public.
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
      // Explicit rather than relying on the browser's default-Lax behavior
      // for unset SameSite — asserted, not implicit, per Stage 2 security
      // review. secure only in production: required for the cookie to be
      // set at all over plain-HTTP localhost in dev.
      cookieOptions: {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );

  // Refreshes the session cookie on every request — required so SSR reads
  // (Server Components, Route Handlers) see a current session rather than a
  // stale/expired one. Must be getUser(), not getSession(): getSession()
  // trusts the cookie's claims as-is, getUser() revalidates against Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // API routes enforce their own auth via withAuth, which returns a JSON
  // { error, code, status } 401 — never redirect them to the login *page*.
  // Found via live testing: an API client (or Playwright's request context,
  // which follows redirects by default) would otherwise see a 200 with HTML
  // login-page content instead of a real 401, silently masking auth
  // failures. Session refresh above still runs for API routes either way.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isApiRoute && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Found in Stage 2 verification: this excluded favicon.ico, but
    // public/favicon.png (what layout.tsx actually references) wasn't
    // covered, so unauthenticated favicon requests fell through and got
    // redirected to /login — harmless for rendering (browsers don't block
    // page load on a failed icon fetch) but still wrong. Matches
    // public/'s actual contents now instead of a guessed list.
    "/((?!_next/static|_next/image|favicon\\.(?:ico|png)|manifest\\.json|icons/|sw\\.js|workbox-).*)",
  ],
};
