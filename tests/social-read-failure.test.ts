import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Imported dynamically, after the env is in place: lib/social.ts pulls in
// lib/supabase.ts, which builds a browser client AT MODULE LOAD and throws
// without these. Nothing here talks to Supabase — every call takes an
// injected `db` — but the module graph has to resolve first. Worth knowing:
// that module-level side effect is why this file had no unit tests.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
const { getProfileVisits, getPlannedWith, getVisitCollections } =
  await import("../lib/social.ts");

// A failed read must never arrive as "there is nothing here".
//
// These three feed the Been and Friends tabs, whose empty states say "No
// visits logged yet" and "Nobody here yet". Both are true things that happen
// to a new account, which is exactly why they are dangerous: collapsing a
// failed read into [] tells a RETURNING user their history does not exist and
// invites them to start over.
//
// The functions already checked `error` and returned [] anyway — code that
// reads as careful. So the property worth pinning is not "the error is
// checked", it is "failure stays distinguishable from emptiness all the way
// out of the function".

/** A Supabase query builder stub: every chained call returns itself. */
function fakeDb(result: { data: unknown; error: unknown }): SupabaseClient {
  const thenable = {
    select: () => thenable,
    eq: () => thenable,
    order: () => thenable,
    limit: () => thenable,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { from: () => thenable } as unknown as SupabaseClient;
}

const FAILED = { data: null, error: { message: "network" } };
const EMPTY = { data: [], error: null };

test("getProfileVisits reports a failed read rather than no visits", async () => {
  const failed = await getProfileVisits("person-1", 50, fakeDb(FAILED));
  assert.equal(failed.failed, true, "a read error must set failed");
  assert.deepEqual(failed.rows, []);

  const empty = await getProfileVisits("person-1", 50, fakeDb(EMPTY));
  assert.equal(empty.failed, false, "genuinely empty must NOT look like a failure");
  assert.deepEqual(empty.rows, []);
});

test("getPlannedWith reports a failed read rather than nobody", async () => {
  assert.equal((await getPlannedWith("person-1", fakeDb(FAILED))).failed, true);
  assert.equal((await getPlannedWith("person-1", fakeDb(EMPTY))).failed, false);
});

test("getVisitCollections reports a failed read rather than no collections", async () => {
  assert.equal((await getVisitCollections("person-1", fakeDb(FAILED))).failed, true);
  assert.equal((await getVisitCollections("person-1", fakeDb(EMPTY))).failed, false);
});

test("the two states are distinguishable, which is the whole point", async () => {
  const failed = await getProfileVisits("p", 50, fakeDb(FAILED));
  const empty = await getProfileVisits("p", 50, fakeDb(EMPTY));
  assert.deepEqual(failed.rows, empty.rows, "both carry no rows");
  assert.notEqual(failed.failed, empty.failed, "and are still told apart");
});
