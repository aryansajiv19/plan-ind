import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { safeNextPath, sessionUser } from "../lib/auth.ts";

test("safeNextPath falls back to /home when the URL parser throws", () => {
  for (const value of ["//[", "//:", "///:x"]) assert.equal(safeNextPath(value), "/home");
});

test("safeNextPath passes an internal path through unchanged", () => {
  assert.equal(
    safeNextPath("/plan/22222222-2222-2222-2222-222222222222"),
    "/plan/22222222-2222-2222-2222-222222222222",
  );
});

test("safeNextPath rejects protocol-relative and absolute URLs", () => {
  assert.equal(safeNextPath("//evil.com"), "/home");
  assert.equal(safeNextPath("http://evil.com"), "/home");
  assert.equal(safeNextPath("https://evil.com"), "/home");
});

test("safeNextPath falls back to /home for missing values", () => {
  assert.equal(safeNextPath(null), "/home");
  assert.equal(safeNextPath(undefined), "/home");
  assert.equal(safeNextPath(""), "/home");
});

test("safeNextPath rejects a path without a leading slash", () => {
  assert.equal(safeNextPath("plan/x"), "/home");
});

test("safeNextPath refuses anything the URL parser could turn into another origin", () => {
  for (const hostile of [
    "/\t/evil.com", "/\n/evil.com", "/\r\n/evil.com", "/\\evil.com", "//evil.com",
    "/\u0000/evil.com", "https://evil.com", "/%09/evil.com/..//evil.com\\x",
  ]) {
    assert.equal(safeNextPath(hostile), "/home", JSON.stringify(hostile));
  }
  // Encoded separators stay on our origin as path text, so they pass unchanged.
  assert.equal(safeNextPath("/%5C%5Cevil.com"), "/%5C%5Cevil.com");
  assert.equal(safeNextPath("/%2F%2Fevil.com"), "/%2F%2Fevil.com");
  assert.equal(safeNextPath("/plan/abc?x=1#y"), "/plan/abc?x=1#y");
});

test("safeNextPath refuses dot segments that collapse into a protocol-relative //host", () => {
  const shapes = [
    "/.//evil.com", "/..//evil.com", "/a/..//evil.com", "/%2e//evil.com", "/%2e%2e//evil.com",
    "/.%2e//evil.com", "/%2E//evil.com", "/.///evil.com", "/././/evil.com", "/a/b/../..//evil.com?x#y",
  ];
  for (const hostile of shapes) assert.equal(safeNextPath(hostile), "/home", hostile);
  // Whatever the input, the result is never something a browser reads as another host.
  for (const value of [...shapes, "//evil.com", "/\\evil.com", "/%2F%2Fevil.com", "/./home", "/a/../plan/x"]) {
    assert.ok(!/^[/\\]{2}/.test(safeNextPath(value)), value);
  }
  // Dot segments that land on a normal path still work.
  assert.equal(safeNextPath("/a/../plan/x"), "/plan/x");
});

// sessionUser: an auth outage must never read as "signed out" (that told
// signed-in people to sign in, as a 401, under load).
const clientReturning = (user: unknown, error: unknown) =>
  ({ auth: { getUser: async () => ({ data: { user }, error }) } }) as unknown as SupabaseClient;

test("sessionUser returns the user when getUser finds one", async () => {
  const user = { id: "u1", is_anonymous: false };
  assert.equal(await sessionUser(clientReturning(user, null)), user);
});

test("sessionUser is signed-out for no session or a token GoTrue rejected", async () => {
  assert.equal(await sessionUser(clientReturning(null, null)), "signed-out");
  assert.equal(await sessionUser(clientReturning(null, new AuthSessionMissingError())), "signed-out");
  assert.equal(await sessionUser(clientReturning(null, new AuthApiError("invalid JWT", 403, "bad_jwt"))), "signed-out");
});

test("sessionUser is unavailable when the auth service did not answer", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    // status 0 is what auth-js throws for a failed fetch (connection reset).
    assert.equal(await sessionUser(clientReturning(null, new AuthRetryableFetchError("fetch failed", 0))), "unavailable");
    assert.equal(await sessionUser(clientReturning(null, new AuthRetryableFetchError("bad gateway", 502))), "unavailable");
    assert.equal(await sessionUser(clientReturning(null, new AuthUnknownError("not json", null))), "unavailable");
    // A GoTrue 5xx that still carries a JSON body arrives as AuthApiError.
    assert.equal(await sessionUser(clientReturning(null, new AuthApiError("internal", 500, "unexpected_failure"))), "unavailable");
  } finally {
    console.error = quiet;
  }
});

// The proxy's /plan gate: an auth outage must not read as signed out either
// (it bounced signed-in members to /login). No network: global fetch is
// stubbed, and the Supabase URL is a local placeholder.
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
const PLAN_PATH = "/plan/22222222-2222-2222-2222-222222222222";

function sessionCookie(): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  // HS256, so getClaims() has to ask GoTrue (GET /user) rather than verify locally.
  const accessToken = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", exp, role: "authenticated", is_anonymous: false })}.sig`;
  const session = { access_token: accessToken, refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id: "u1" } };
  return `sb-127-auth-token=base64-${b64(session)}`;
}

async function planPageWith(upstream: () => Promise<Response>, cookie?: string) {
  const { proxy } = await import("../proxy.ts");
  const { NextRequest } = await import("next/server");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return upstream(); };
  try {
    const response = await proxy(new NextRequest(`http://localhost${PLAN_PATH}`, { headers: cookie ? { cookie } : {} }));
    return { location: response.headers.get("location"), calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const json = (status: number, body: object) => async () => Response.json(body, { status });

test("proxy keeps a member on the plan page when the auth service fails", async () => {
  for (const [name, upstream] of [
    ["network error", async () => { throw new TypeError("fetch failed"); }],
    ["502", json(502, { message: "bad gateway" })],
    ["500 JSON", json(500, { code: "unexpected_failure", msg: "internal" })],
    ["500 non-JSON", async () => new Response("<html>oops</html>", { status: 500 })],
  ] as const) {
    const { location, calls } = await planPageWith(upstream, sessionCookie());
    assert.ok(calls > 0, `${name}: the stub must actually be reached`);
    assert.equal(location, null, `${name}: an outage must not redirect to /login`);
  }
});

test("proxy skips /api/* (routes authenticate themselves) but still runs on every page", async () => {
  const { config } = await import("../proxy.ts");
  const { unstable_doesMiddlewareMatch: runs } = await import("next/experimental/testing/server");
  for (const url of ["/api/spots/deal", "/api/weather?lat=25&lon=55", "/api/plans/x/command", "/api/health"]) {
    assert.equal(runs({ config, url }), false, url);
  }
  for (const url of [PLAN_PATH, "/login", "/invite", "/home", "/auth/callback", "/apiary", "/"]) {
    assert.equal(runs({ config, url }), true, url);
  }
});

test("proxy still sends a signed-out visitor, or a rejected token, to /login", async () => {
  const signedOut = await planPageWith(json(200, {}));
  assert.equal(signedOut.calls, 0);
  assert.match(signedOut.location ?? "", /\/login\?next=%2Fplan%2F2{8}-/);
  const rejected = await planPageWith(json(403, { code: "bad_jwt", msg: "invalid JWT" }), sessionCookie());
  assert.ok(rejected.calls > 0);
  assert.match(rejected.location ?? "", /\/login\?next=/);
});
