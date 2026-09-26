import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";
import { safeNextPath, sessionUser } from "../lib/auth.ts";

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
  assert.equal(safeNextPath("/%2F%2Fevil.com"), "/%2F%2Fevil.com");
  assert.equal(safeNextPath("/plan/abc?x=1#y"), "/plan/abc?x=1#y");
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
