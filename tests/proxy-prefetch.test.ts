import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

// The signed-out nav and the join card link to /login, and Next prefetches
// links in the background. A prefetch that ended the anonymous session cleared
// the guest's cookies unprompted (CI sign-in-gate spec, 2026-10-01).
// The request is built as the proxy really receives it: Next strips the
// next-router-* headers and the `_rsc` param first (checked against a real
// `next start`, 2026-11-03), so the browser's Sec-Fetch-Dest is what is left.
// (Versions keyed on the header, then on `_rsc`, passed here and failed in CI.)
test("a link prefetch of /login keeps a guest session; a real visit ends it", async () => {
  const { proxy } = await import("../proxy.ts");
  const { NextRequest } = await import("next/server");
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "g1", exp, role: "authenticated", is_anonymous: true })}.sig`;
  const session = { access_token: token, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: "g1" } };
  const cookie = `sb-127-auth-token=base64-${b64(session)}`;

  const endsSession = async (headers: Record<string, string>) => {
    const realFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      return url.includes("/logout") ? new Response(null, { status: 204 }) : Response.json({ id: "g1", is_anonymous: true });
    };
    try {
      await proxy(new NextRequest("http://localhost/login", { headers: { cookie, ...headers } }));
    } finally {
      globalThis.fetch = realFetch;
    }
    return urls.some((url) => url.includes("/logout"));
  };

  // Exactly what a prefetch looked like at the proxy (x-probe on next start).
  assert.equal(await endsSession({ "sec-fetch-dest": "empty", accept: "*/*" }), false, "a prefetch must leave the session alone");
  assert.equal(await endsSession({ accept: "*/*" }), false, "no Sec-Fetch-Dest and not asking for HTML: not a page load");
  assert.equal(await endsSession({ "sec-fetch-dest": "document", accept: "text/html" }), true, "a real visit still ends it (and proves the stub reaches the logout call)");
  assert.equal(await endsSession({ accept: "text/html,application/xhtml+xml" }), true, "an older browser's page load still ends it");
});
