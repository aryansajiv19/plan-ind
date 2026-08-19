import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestValidationError,
  plainText,
  readJsonBody,
  validateMutationRequest,
} from "../lib/security/request.ts";

test("plainText normalizes and removes controls and bidi overrides", () => {
  assert.equal(plainText("  Cafe\u202e\u0000 name  ", 20), "Cafe name");
  assert.equal(plainText({ unsafe: true }, 20), "");
  assert.equal(plainText("long value", 4), "long");
});

test("mutation requests require same-origin double-submit CSRF", () => {
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
