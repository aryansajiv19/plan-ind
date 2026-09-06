import assert from "node:assert/strict";
import test from "node:test";
import { log, redactHeaders, serializeError } from "../lib/observability/log.ts";

// Redaction is the security-relevant half of this module: instrumentation.ts
// hands it real request headers, and this app's Supabase session cookie is
// JS-readable by design, so a miss here writes live session tokens into the
// platform log store.

test("redacts the Supabase session cookie by prefix, not just by exact name", () => {
  const safe = redactHeaders({
    "sb-zyojaoyatunjwgbivaqu-auth-token": "eyJhbGciOi.real.token",
    "sb-zyojaoyatunjwgbivaqu-auth-token.0": "chunk-zero",
    "SB-Other-Project-Auth-Token": "another",
  });
  for (const value of Object.values(safe)) assert.equal(value, "[redacted]");
});

test("redacts credential headers case-insensitively", () => {
  const safe = redactHeaders({
    Cookie: "session=abc",
    AUTHORIZATION: "Bearer token",
    "X-Api-Key": "key",
    "x-csrf-token": "csrf",
  });
  assert.deepEqual(safe, {
    cookie: "[redacted]",
    authorization: "[redacted]",
    "x-api-key": "[redacted]",
    "x-csrf-token": "[redacted]",
  });
});

// Regression: the first live probe of instrumentation.ts found Next's own
// `x-middleware-set-cookie` carrying the __Host-csrf token in clear. No
// exact-name list would have held it, because the framework invents the
// header. This is why matching is by marker.
test("redacts framework-invented credential headers, not just known names", () => {
  const safe = redactHeaders({
    "x-middleware-set-cookie": "__Host-csrf=d4e32ff6-6550-45f8-97df-9ba79d337fb6; Path=/",
    "x-some-future-session-id": "abc",
    "x-vendor-access-token": "xyz",
  });
  for (const value of Object.values(safe)) assert.equal(value, "[redacted]");
});

// On /auth/callback the referer is the OAuth redirect, complete with its
// `?code=` PKCE grant. It carries no marker word, so it passed the filter
// until a review pointed it out.
test("redacts referer, which carries the OAuth code on the auth callback", () => {
  const safe = redactHeaders({
    referer: "https://plan-ind.app/auth/callback?code=abc123-pkce-grant&state=xyz",
    Referrer: "https://example.test/?token=leak",
  });
  assert.equal(safe.referer, "[redacted]");
  assert.equal(safe.referrer, "[redacted]");
});

test("keeps ordinary headers so the log stays useful", () => {
  const safe = redactHeaders({ "user-agent": "curl/8", "x-vercel-id": "iad1::abc" });
  assert.equal(safe["user-agent"], "curl/8");
  assert.equal(safe["x-vercel-id"], "iad1::abc");
});

test("joins repeated headers and drops undefined ones", () => {
  const safe = redactHeaders({ accept: ["a", "b"], "x-missing": undefined });
  assert.equal(safe.accept, "a, b");
  assert.ok(!("x-missing" in safe));
});

test("serializeError keeps the digest that correlates a React stand-in to the real error", () => {
  const error = Object.assign(new Error("boom"), { digest: "3405610579" });
  const out = serializeError(error);
  assert.equal(out.name, "Error");
  assert.equal(out.message, "boom");
  assert.equal(out.digest, "3405610579");
});

test("serializeError survives a non-Error throw", () => {
  assert.deepEqual(serializeError("just a string"), {
    name: "NonError",
    message: "just a string",
    digest: undefined,
  });
});

test("log never throws on a circular field", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  const original = console.error;
  const lines: string[] = [];
  console.error = (line: string) => void lines.push(line);
  try {
    assert.doesNotThrow(() => log("error", "server_error", { circular }));
  } finally {
    console.error = original;
  }
  assert.equal(JSON.parse(lines[0]).serializationFailed, true);
});

test("log emits one parseable JSON line with level and event", () => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (line: string) => void lines.push(line);
  try {
    log("error", "server_error", { path: "/plan/x" });
  } finally {
    console.error = original;
  }
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, "error");
  assert.equal(parsed.event, "server_error");
  assert.equal(parsed.path, "/plan/x");
  assert.ok(Date.parse(parsed.at));
});

// A security review found the third leak of this class: `referer` was
// redacted for carrying the OAuth code, while `request.path` — which carries
// it directly on /auth/callback — was logged raw. instrumentation.ts now
// logs the pathname only; these pin the header half.
test("redacts Vercel's protection-bypass and OIDC headers", () => {
  const safe = redactHeaders({
    "x-vercel-protection-bypass": "live-bypass-secret",
    "x-vercel-set-bypass-cookie": "true",
    "x-vercel-sc-headers": '{"Authorization":"Bearer eyJ..."}',
  });
  for (const value of Object.values(safe)) assert.equal(value, "[redacted]");
});

test("redacts client IPs, which the app HMACs everywhere it persists them", () => {
  const safe = redactHeaders({
    "x-forwarded-for": "203.0.113.7, 70.41.3.18",
    "x-real-ip": "203.0.113.7",
    "x-vercel-ip-country": "AE",
  });
  for (const value of Object.values(safe)) assert.equal(value, "[redacted]");
});
