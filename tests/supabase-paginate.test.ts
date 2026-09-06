import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllRows } from "../lib/supabase/paginate.ts";

const PAGE = 1000;
const rowsFor = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

// A fake page() driven by a script of per-page outcomes, so the failure cases
// are exact rather than hoped for.
function pager(pages: Array<{ data: { id: number }[] | null; error: unknown }>) {
  const calls: number[] = [];
  const page = (from: number) => {
    calls.push(from);
    return Promise.resolve(pages[from / PAGE] ?? { data: [], error: null });
  };
  return { page, calls };
}

test("a single short page is the complete answer", async () => {
  const { page } = pager([{ data: rowsFor(42), error: null }]);
  assert.equal((await fetchAllRows(page, "test"))?.length, 42);
});

test("full pages are followed until a short one ends it", async () => {
  const { page, calls } = pager([
    { data: rowsFor(PAGE), error: null },
    { data: rowsFor(PAGE), error: null },
    { data: rowsFor(7), error: null },
  ]);
  const rows = await fetchAllRows(page, "test");
  assert.equal(rows?.length, PAGE * 2 + 7);
  assert.deepEqual(calls, [0, 1000, 2000]);
});

// The reason this helper exists. Returning the rows gathered before a
// mid-run failure would be indistinguishable from a complete answer at the
// call site -- which is the deal-loop incident it was written to remove,
// reached through its own fix.
test("a mid-run page failure returns null, never the rows collected so far", async () => {
  const { page } = pager([
    { data: rowsFor(PAGE), error: null },
    { data: null, error: { code: "57014", message: "statement timeout" } },
  ]);
  assert.equal(await fetchAllRows(page, "test"), null,
    "a partial result must not reach a caller that can only check for null");
});

test("an error alongside rows still fails the whole read", async () => {
  const { page } = pager([{ data: rowsFor(3), error: { message: "transient" } }]);
  assert.equal(await fetchAllRows(page, "test"), null);
});

test("a first-page failure returns null rather than an empty array", async () => {
  const { page } = pager([{ data: null, error: { message: "boom" } }]);
  const result = await fetchAllRows(page, "test");
  assert.equal(result, null,
    "[] would read as 'the table is empty', which is the failure mode being fixed");
});

test("exhausting every page without a short one is an error, not a result", async () => {
  // Every page full: the answer is truncated at MAX_PAGES and looks exactly
  // like a catalogue that happens to be that size -- the PostgREST cap again
  // with a bigger number.
  const page = () => Promise.resolve({ data: rowsFor(PAGE), error: null });
  assert.equal(await fetchAllRows(page, "test"), null);
});

test("an exactly-page-sized result still terminates", async () => {
  const { page, calls } = pager([
    { data: rowsFor(PAGE), error: null },
    { data: [], error: null },
  ]);
  assert.equal((await fetchAllRows(page, "test"))?.length, PAGE);
  assert.equal(calls.length, 2, "a full final page needs one more read to prove it was the last");
});
