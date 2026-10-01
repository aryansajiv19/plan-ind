import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL === "1" &&
    request.headers.get("x-forwarded-proto") === "http"
  ) {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = "https:";
    return NextResponse.redirect(secureUrl, 308);
  }

  // Generated share images (app/**/opengraph-image.tsx) are fetched by link
  // crawlers with no cookies. They are PNGs: no script to nonce, no session
  // to refresh, and their only data read is keyless (plan_share_preview). Skip
  // the session work so an auth hiccup can never cost a WhatsApp unfurl.
  // Anchored: only the two routes that exist, never a page whose last segment
  // happens to be the same word (which would ship without a CSP).
  if (/^\/(?:plan\/[0-9a-f-]{36}\/)?(?:opengraph|twitter)-image(?:-[\w-]+)?$/.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // A plan page is open to a signed-out visitor: the page itself offers the
  // guest join (migration 099, docs/GUEST_VOTE.md). Every read and write is
  // still refused by the database without a member session; this is routing.
  // Only /login and /invite end a guest session (they are sign-in doors).
  const pathname = request.nextUrl.pathname;
  // Not on a prefetch: the signed-out nav and the join card link to /login, and
  // Next prefetches those links in the background. A prefetch ended the guest's
  // session (its cookies clear on that response), so guests were dropped unprompted.
  const prefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";
  const signOutAnonymous = (pathname === "/login" || pathname === "/invite") && !prefetch;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    // The route map (components/route/RouteMap.tsx): Maps JS loads its
    // scripts through 'strict-dynamic', its Roboto stylesheet and fonts from
    // Google Fonts, and calls maps.googleapis.com and routes.googleapis.com (Route.computeRoutes).
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Dev only: a local Supabase serves signed photo URLs over plain http.
    // Production keeps https: only.
    `img-src 'self' data: blob: https:${isDev && supabaseOrigin.startsWith("http:") ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocket} https://challenges.cloudflare.com https://maps.googleapis.com https://routes.googleapis.com`,
    // Turnstile's challenge frame, and www.google.com for Google's own frames
    // (the Maps JavaScript API behind RouteMap can open one). Nothing of ours
    // embeds a Google page any more; the place page's map is our own SVG.
    "frame-src https://challenges.cloudflare.com https://www.google.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(!isDev ? ["frame-ancestors 'none'", "upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { response } = await updateSession(request, requestHeaders, { signOutAnonymous });

  response.headers.set("Content-Security-Policy", csp);

  const csrfCookieName = process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";
  if (!request.cookies.get(csrfCookieName)?.value) {
    response.cookies.set(csrfCookieName, crypto.randomUUID(), {
      httpOnly: false,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}

// Not /api/*: every route authenticates itself with sessionUser(), whose
// getUser() also refreshes the session and writes the cookies (route handlers
// can). Running the proxy there cost a second GoTrue call per request and
// bought nothing: no HTML to nonce, no /plan gate, and the csrf cookie is set
// on page loads. Server Actions post to page paths, so they stay covered.
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
