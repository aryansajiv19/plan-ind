/**
 * Where this deployment lives. The one answer shared by the code that sends
 * sign-in emails (app/auth/actions.ts) and the callback those emails return
 * to (app/auth/callback/route.ts). They must agree: when the callback guessed
 * its own origin from request.url -- which Next's dev server reports as
 * localhost whatever host the browser used -- the session cookie was set on
 * one host and the redirect went to another, so sign-in silently didn't stick.
 *
 * Precedence, deliberately:
 *  1. A Vercel PREVIEW uses its own deployment URL (VERCEL_URL), even when
 *     NEXT_PUBLIC_SITE_URL is also set -- otherwise every preview sign-in would
 *     be sent to production.
 *  2. NEXT_PUBLIC_SITE_URL, the canonical origin. Required in production.
 *  3. Development only: the host the browser actually used.
 */
export function resolveAppOrigin(request: { host: string | null; forwardedProto: string | null }): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  }

  if (!request.host) return "http://localhost:3000";
  return `${request.forwardedProto ?? "http"}://${request.host}`;
}
