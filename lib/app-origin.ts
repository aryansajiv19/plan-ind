/**
 * Where this deployment lives. The one answer shared by the code that sends
 * sign-in emails (app/auth/actions.ts) and the callback those emails return
 * to (app/auth/callback/route.ts). They must agree: when the callback guessed
 * its own origin from request.url -- which Next's dev server reports as
 * localhost whatever host the browser used -- the session cookie was set on
 * one host and the redirect went to another, so sign-in silently didn't stick.
 *
 * Precedence, deliberately:
 *  1. A Vercel PREVIEW stays on whichever of its own hosts the request came in
 *     on (see previewOrigins), else its deployment URL -- even when
 *     NEXT_PUBLIC_SITE_URL is also set, or every preview sign-in would be sent
 *     to production. It must be the SAME host the request came from: sign-in
 *     is PKCE, the code verifier cookie lives on the host that asked for the
 *     email, and a callback on the other alias has no verifier to exchange.
 *  2. NEXT_PUBLIC_SITE_URL, the canonical origin. Required in production.
 *  3. Development only: the host the browser actually used.
 */
/**
 * A preview deployment's own origins: the immutable deployment URL and the
 * branch alias (the link Vercel surfaces and people share). Empty outside a
 * preview. The single definition of "this preview's hosts" -- the auth
 * redirect picks the member it is on; the CSRF check accepts any member.
 */
export function previewOrigins(): string[] {
  if (process.env.VERCEL_ENV !== "preview") return [];
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host.toLowerCase()}`);
}

export function resolveAppOrigin(request: { host: string | null; forwardedProto: string | null }): string {
  const preview = previewOrigins();
  if (preview.length > 0) {
    // Only ever one of this deployment's own names: a spoofed Host header
    // cannot steer the redirect anywhere else.
    const current = request.host ? `https://${request.host.toLowerCase()}` : null;
    return current && preview.includes(current) ? current : preview[0];
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  }

  if (!request.host) return "http://localhost:3000";
  return `${request.forwardedProto ?? "http"}://${request.host}`;
}
