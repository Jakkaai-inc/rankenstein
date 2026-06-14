import { NextResponse, type NextRequest } from "next/server";

// Host split (Phase 2): marketing lives on the apex (rankenstein.app), the app lives on
// studio.rankenstein.app. Gated behind RK_STUDIO_LIVE so the middleware can ship before
// the subdomain's cert is active — when off, everything passes through (app + marketing
// both reachable on the apex, as today). Flip RK_STUDIO_LIVE=1 once studio is serving.

const STUDIO = "studio.rankenstein.app";
// App-only path prefixes that belong on the studio subdomain.
const APP_PREFIXES = ["/login", "/p", "/r", "/projects", "/review"];

export function middleware(req: NextRequest) {
  if (process.env.RK_STUDIO_LIVE !== "1") return NextResponse.next();

  const host = (req.headers.get("host") || "").toLowerCase();
  const { pathname, search } = req.nextUrl;
  const isStudio = host === STUDIO || host === `www.${STUDIO}`;
  const isApex = host === "rankenstein.app" || host === "www.rankenstein.app";
  const isApp = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isStudio) {
    // studio root -> the app's sign-in (which forwards to /p when authed)
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isApex && isApp) {
    // send app routes to the studio subdomain, preserving path + query
    return NextResponse.redirect(`https://${STUDIO}${pathname}${search}`);
  }

  return NextResponse.next();
}

export const config = {
  // run on pages only — never on /api, Next internals, or static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
