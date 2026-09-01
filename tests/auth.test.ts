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
