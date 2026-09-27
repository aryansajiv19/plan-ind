import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestValidationError,
  plainText,
  rateLimitKey,
  readJsonBody,
  validateMutationRequest,
} from "../lib/security/request.ts";

test("plainText normalizes and removes controls and bidi overrides", () => {
  assert.equal(plainText("  Cafe\u202e\u0000 name  ", 20), "Cafe name");
  assert.equal(plainText({ unsafe: true }, 20), "");
  assert.equal(plainText("long value", 4), "long");
});

test("mutation requests require same-origin double-submit CSRF", (t) => {
  // Hermetic: a configured canonical origin (CI sets one) must not decide
  // which origin this test's requests come from.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  t.after(() => {
    if (configured !== undefined) process.env.NEXT_PUBLIC_SITE_URL = configured;
  });
  const valid = new Request("http://localhost:3000/api/plans", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      cookie: "csrf=known-token",
      "x-csrf-token": "known-token",
    },
  });
  assert.doesNotThrow(() => validateMutationRequest(valid));

  for (const headers of [
    { origin: "https://attacker.invalid", cookie: "csrf=a", "x-csrf-token": "a" },
    { origin: "http://localhost:3000", cookie: "csrf=a", "x-csrf-token": "b" },
  ]) {
    assert.throws(
      () => validateMutationRequest(new Request("http://localhost:3000/api/plans", { headers })),
      (error) => error instanceof RequestValidationError && error.status === 403,
    );
  }
});

test("JSON reader rejects wrong types, malformed JSON, and oversized streams", async () => {
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", { method: "POST", body: "{}" }), 100),
    (error) => error instanceof RequestValidationError && error.status === 415,
  );
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }), 100),
    (error) => error instanceof RequestValidationError && error.status === 400,
  );
  await assert.rejects(
    readJsonBody(new Request("http://localhost/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "too large" }),
    }), 8),
    (error) => error instanceof RequestValidationError && error.status === 413,
  );
});

test("a per-IP limit counts IPv4 whole and IPv6 by its /64", () => {
  assert.equal(rateLimitKey("203.0.113.7"), "203.0.113.7");
  // One /64, however the address is written, is one key.
  const home = "2001:db8:85a3:12::/64";
  for (const ip of ["2001:db8:85a3:12::1", "2001:0DB8:85a3:0012:ffff:1:2:3", "2001:db8:85a3:12:0:0:0:9%eth0"]) {
    assert.equal(rateLimitKey(ip), home, ip);
  }
  assert.notEqual(rateLimitKey("2001:db8:85a3:13::1"), home); // the next /64 is someone else
  assert.equal(rateLimitKey("::1"), "0:0:0:0::/64");
  assert.equal(rateLimitKey("::ffff:198.51.100.4"), "198.51.100.4");
  assert.equal(rateLimitKey("unknown"), "unknown");
  assert.equal(rateLimitKey("1::2::3"), "1::2::3"); // unparseable stays whole
});

