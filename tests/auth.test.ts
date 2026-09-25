import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../lib/auth.ts";

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
