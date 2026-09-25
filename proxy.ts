import type { NextRequest } from "next/server";
import { NextResponse, userAgent } from "next/server";
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

  // A plan page needs a real account (owner decision 2026-09-25). Gated here,
  // before render, not in the page: a redirect thrown while rendering also
  // replaces the <head> a link crawler reads, and WhatsApp would unfurl the
  // login page instead of the plan. Known crawlers (Next's isBot list:
  // WhatsApp, facebookexternalhit, Twitterbot, Slackbot, Discordbot, ...) get
  // the metadata and the client shell, which reads nothing without a session;
  // the database refuses a sessionless or anonymous caller anyway. This is
  // routing, not authorization.
  const pathname = request.nextUrl.pathname;
  const planPage = /^\/plan\/[0-9a-f-]{36}\/?$/i.test(pathname);
  // /login too: /invite gates client-side (it must stash its #token first),
  // so a guest session arriving from there is ended before sign-in.
  const signOutAnonymous = planPage || pathname === "/login" || pathname === "/invite";

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Dev only: a local Supabase serves signed photo URLs over plain http.
    // Production keeps https: only.
    `img-src 'self' data: blob: https:${isDev && supabaseOrigin.startsWith("http:") ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${supabaseSocket} https://challenges.cloudflare.com`,
    // Turnstile, and the venue map (components/VenueMap.tsx). The map's own
    // tiles and scripts load under Google's policy inside the frame; only its
    // document URL is ours to allow. The keyed Maps Embed API is the same host.
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

  const { response, session } = await updateSession(request, requestHeaders, { signOutAnonymous });

  if (planPage && session !== "member" && !userAgent(request).isBot) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname.replace(/\/$/, ""));
    const toLogin = NextResponse.redirect(login);
    // Carry the refreshed-or-cleared session cookies (a guest's sign-out) onto
    // the redirect; dropping them would leave the old session in place.
    for (const cookie of response.headers.getSetCookie()) toLogin.headers.append("set-cookie", cookie);
    return toLogin;
  }
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
