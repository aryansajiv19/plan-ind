import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  boardItemRow,
  createMoodboard,
  deleteMoodboard,
  getMoodboards,
  removeMoodboardItem,
  safeExternalUrl,
  spotIdFromItem,
} from "../lib/social.ts";
import { boardPlanPrefill, originForArea } from "../lib/board-plan.ts";

const SPOT = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";

/** A PostgREST builder stub: every chained call returns itself, and awaiting
 *  it (or .maybeSingle()) resolves to the given result. */
function fakeDb(result: { data: unknown; error: unknown }): SupabaseClient {
  const done = () => Promise.resolve(result);
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => done().then(resolve),
    maybeSingle: done,
  };
  for (const name of ["select", "eq", "order", "in", "insert", "update", "delete"]) builder[name] = () => builder;
  return { from: () => builder } as unknown as SupabaseClient;
}

// ─── Board → plan prefill ──────────────────────────────────────────

const any = () => true;

test("prefill leans on the category most of the board shares", () => {
  const prefill = boardPlanPrefill(
    { id: "b", name: "Friday crew" },
    [{ category: "cafe", area: "JBR" }, { category: "dinner", area: "Dubai Marina" }, { category: "dinner", area: "JBR" }],
    any,
    "k",
  );
  assert.equal(prefill.category, "dinner");
  assert.equal(prefill.origin, "marina", "all three sit by the Marina");
  assert.equal(prefill.title, "Friday crew");
});

test("prefill never picks a category the viewer may not plan", () => {
  const places = [{ category: "nightlife", area: "DIFC" }, { category: "nightlife", area: "DIFC" }, { category: "cafe", area: "DIFC" }];
  const prefill = boardPlanPrefill({ id: "b", name: "x" }, places, (c) => c !== "nightlife", "k");
  assert.equal(prefill.category, "cafe");
  assert.equal(boardPlanPrefill({ id: "b", name: "x" }, places.slice(0, 2), (c) => c !== "nightlife", "k").category, null);
});

test("one nearby place does not narrow the whole deal to its area", () => {
  const prefill = boardPlanPrefill(
    { id: "b", name: "x" },
    [{ category: "cafe", area: "JBR" }, { category: "cafe", area: "Nowhere known" }, { category: "cafe", area: "Al Khawaneej" }],
    any,
    "k",
  );
  assert.equal(prefill.origin, "anywhere");
  assert.equal(boardPlanPrefill({ id: "b", name: "x" }, [], any, "k").origin, "anywhere");
});

test("an area maps to a starting point only when it is close to one", () => {
  assert.equal(originForArea("Dubai Marina"), "marina");
  assert.equal(originForArea("Al Khawaneej"), null, "far from every named origin");
  assert.equal(originForArea("Somewhere unmapped"), null);
});

// ─── Item shapes: what may be saved and rendered as a link ─────────

test("only http(s) links are saved or rendered", () => {
  assert.equal(safeExternalUrl("https://example.com/menu"), "https://example.com/menu");
  for (const hostile of ["javascript:alert(1)", "data:text/html,x", "example.com", "", null]) {
    assert.equal(safeExternalUrl(hostile), null, String(hostile));
  }
  assert.equal(boardItemRow("b", { kind: "link", url: "javascript:alert(1)" }), null);
  assert.equal(boardItemRow("b", { kind: "link", url: "https://www.timeout.com/dubai" })?.label, "timeout.com");
});

test("a place item round-trips its spot id through source_url", () => {
  const row = boardItemRow("b", { kind: "place", spotId: SPOT, label: "  Ninive " });
  assert.equal(row?.label, "Ninive");
  assert.equal(spotIdFromItem({ kind: "place", source_url: row!.source_url }), SPOT);
  assert.equal(boardItemRow("b", { kind: "place", spotId: "not-a-uuid", label: "x" }), null);
  assert.equal(spotIdFromItem({ kind: "link", source_url: `/place/${SPOT}` }), null, "a link is never a place");
  assert.equal(spotIdFromItem({ kind: "place", source_url: `https://evil.test/place/${SPOT}` }), null);
});

// ─── Failure stays distinguishable ─────────────────────────────────

test("a failed board read is not an empty one", async () => {
  const failed = await getMoodboards("p", fakeDb({ data: null, error: { message: "network" } }));
  const empty = await getMoodboards("p", fakeDb({ data: [], error: null }));
  assert.equal(failed.failed, true);
  assert.equal(empty.failed, false);
  assert.deepEqual(failed.rows, empty.rows);
});

test("items come back newest first", async () => {
  const read = await getMoodboards("p", fakeDb({
    data: [{ id: "b", items: [{ id: "old", created_at: "2026-09-01T00:00:00Z" }, { id: "new", created_at: "2026-09-20T00:00:00Z" }] }],
    error: null,
  }));
  assert.deepEqual(read.rows[0].items.map((i) => i.id), ["new", "old"]);
});

test("a refused (0-row) delete is not reported as success", async () => {
  assert.equal(await deleteMoodboard("b", fakeDb({ data: [], error: null })), false);
  assert.equal(await deleteMoodboard("b", fakeDb({ data: [{ id: "b" }], error: null })), true);
  assert.equal(await removeMoodboardItem("i", fakeDb({ data: [], error: null })), false);
});

test("a duplicate board name is told apart from a failure", async () => {
  const dup = await createMoodboard("p", "Summer", fakeDb({ data: null, error: { code: "23505" } }));
  assert.deepEqual(dup, { ok: false, reason: "duplicate" });
  const refused = await createMoodboard("p", "Summer", fakeDb({ data: null, error: null }));
  assert.deepEqual(refused, { ok: false, reason: "failed" });
  assert.deepEqual(await createMoodboard("p", "   ", fakeDb({ data: null, error: null })), { ok: false, reason: "invalid" });
});
