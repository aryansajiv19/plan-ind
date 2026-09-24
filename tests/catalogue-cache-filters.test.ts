// C1/C2: the logic around the cached curated catalogue and the read-first
// profile. Hermetic -- fake clients, no network. The cache itself
// (lib/spots/catalogue.ts, unstable_cache) is Next runtime and is exercised by
// the build, not here; what is tested is everything that must stay PER
// REQUEST once the pool is shared.
import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dealSpotIds, type DealSpotRow } from "../lib/spots/match.ts";
import { mergeDiscoverSpots } from "../lib/spots/discover.ts";
import { ensureOwnProfile } from "../lib/own-profile.ts";

function spot(id: string, overrides: Partial<DealSpotRow> = {}): DealSpotRow {
  return {
    id, name: `Spot ${id}`, category: "dinner", area: "Dubai Marina", cuisine: "Levantine",
    min_spend: 100, vibe: "relaxed", description: null, latitude: null, longitude: null,
    minimum_age: null, ...overrides,
  };
}

/** A chainable fake: records every call, resolves to `result(table, calls)`. */
function fakeDb(result: (table: string, calls: [string, unknown[]][]) => { data: unknown; error: unknown }) {
  const log: { table: string; calls: [string, unknown[]][] }[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
  const db = {
    from(table: string) {
      const entry = { table, calls: [] as [string, unknown[]][] };
      log.push(entry);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "in", "order", "range", "limit", "maybeSingle"]) {
        chain[m] = (...args: unknown[]) => { entry.calls.push([m, args]); return chain; };
      }
      chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve(result(table, entry.calls)).then(ok, bad);
      return chain;
    },
    rpc(name: string, args: unknown) {
      rpcs.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  };
  return {
    db: db as unknown as SupabaseClient,
    log,
    rpcs,
    setRpc(r: { data: unknown; error: unknown }) { rpcResult = r; },
  };
}

// ── Deal: one shared (cached) pool, per-request eligibility ──────────────

const SHARED_POOL: readonly DealSpotRow[] = Object.freeze([
  spot("a"), spot("b"), spot("c"),
  spot("bar", { category: "dinner", minimum_age: 21 }),
  spot("pricey", { min_spend: 900 }),
]);

function ratingsDb() {
  return fakeDb(() => ({ data: [], error: null }));
}

test("the same cached pool deals by each caller's own age, never the first caller's", async () => {
  const loader = async () => SHARED_POOL;
  const adult = ratingsDb();
  const adultIds = await dealSpotIds(adult.db, { category: "dinner", count: 5, constraints: { age: 25 }, rng: () => 0.5 }, loader);
  assert.deepEqual(new Set(adultIds), new Set(["a", "b", "c", "bar", "pricey"]));

  const teen = ratingsDb();
  // 18 cannot fill five without the 21+ venue: refused, not padded with it.
  assert.equal(await dealSpotIds(teen.db, { category: "dinner", count: 5, constraints: { age: 18 } }, loader), null);
  const teenIds = await dealSpotIds(teen.db, { category: "dinner", count: 4, constraints: { age: 18 }, rng: () => 0.5 }, loader);
  assert.ok(teenIds && !teenIds.includes("bar"), "a 21+ venue reached an 18-year-old from the shared pool");
  assert.equal(teenIds.length, 4);
});

test("budget, exclusions and 'been' are applied per request on the shared pool", async () => {
  const loader = async () => SHARED_POOL;
  const ids = await dealSpotIds(ratingsDb().db, {
    category: "dinner", count: 2, excludeIds: ["a"], been: ["b"],
    constraints: { age: 25, maxBudget: 200 },
  }, loader);
  assert.ok(ids);
  assert.ok(!ids.includes("a") && !ids.includes("pricey"));
  assert.ok(!ids.includes("b"), "'been' should be honoured when the rest can fill the deal");
});

test("filtering never mutates the cached pool", async () => {
  const pool = SHARED_POOL.map((s) => ({ ...s }));
  const snapshot = JSON.stringify(pool);
  await dealSpotIds(ratingsDb().db, { category: "dinner", count: 2, excludeIds: ["a"], constraints: { age: 18 } }, async () => pool);
  assert.equal(JSON.stringify(pool), snapshot);
});

test("the ratings read stays on the caller's client and only covers eligible spots", async () => {
  const f = ratingsDb();
  await dealSpotIds(f.db, { category: "dinner", count: 3, constraints: { age: 18 } }, async () => SHARED_POOL);
  assert.deepEqual(f.log.map((e) => e.table), ["ratings"], "the pool must come from the loader, not the caller's client");
  const inCall = f.log[0].calls.find(([m]) => m === "in");
  assert.ok(inCall);
  assert.ok(!(inCall[1][1] as string[]).includes("bar"), "ratings were read for an ineligible spot");
});

test("a failed pool load is no deal, never an empty or partial one", async () => {
  assert.equal(await dealSpotIds(ratingsDb().db, { category: "dinner", count: 1 }, async () => null), null);
});

test("without a loader, dealSpotIds still reads the pool live through the caller's client", async () => {
  const f = fakeDb((table) => ({ data: table === "spots" ? [...SHARED_POOL] : [], error: null }));
  const ids = await dealSpotIds(f.db, { category: "dinner", count: 1, constraints: { age: 25 } });
  assert.equal(ids?.length, 1);
  assert.equal(f.log[0].table, "spots");
  assert.ok(f.log[0].calls.some(([m, a]) => m === "eq" && a[0] === "source" && a[1] === "curated"));
});

// ── Discover: cached curated half + live per-user half ───────────────────

type Row = { id: string; name: string };
const row = (id: string, name: string): Row => ({ id, name });

test("merge rebuilds 'order by name limit n' over the union", () => {
  const curated = [row("1", "Arabian Tea House"), row("2", "Bu Qtair"), row("3", "Zuma")];
  const others = [row("9", "al Fanar"), row("8", "Mine")];
  assert.deepEqual(
    mergeDiscoverSpots(curated, others, 4).map((r) => r.name),
    ["al Fanar", "Arabian Tea House", "Bu Qtair", "Mine"],
  );
});

test("equal names order by id, so the grid is stable between requests", () => {
  const a = mergeDiscoverSpots([row("b", "Same")], [row("a", "Same")], 5);
  const b = mergeDiscoverSpots([row("a", "Same")], [row("b", "Same")], 5);
  assert.deepEqual(a.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(b.map((r) => r.id), ["a", "b"]);
});

test("a row in both halves appears once", () => {
  assert.deepEqual(mergeDiscoverSpots([row("1", "X")], [row("1", "X")], 5).length, 1);
});

test("top-n of each half is enough for the top-n of the union", () => {
  // Deterministic generator; assert it really produces distinct inputs.
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const names = new Set<string>();
  for (let trial = 0; trial < 200; trial++) {
    const n = 1 + Math.floor(rnd() * 6);
    const make = (prefix: string) => Array.from({ length: Math.floor(rnd() * 12) }, (_, i) => {
      const name = String.fromCharCode(97 + Math.floor(rnd() * 5)) + Math.floor(rnd() * 3);
      names.add(name);
      return row(`${prefix}${i}`, name);
    });
    const curated = make("c");
    const others = make("o");
    const full = mergeDiscoverSpots(curated, others, n);
    const byName = (xs: Row[]) => mergeDiscoverSpots(xs, [], n); // each half's own top n
    assert.deepEqual(mergeDiscoverSpots(byName(curated), byName(others), n), full);
  }
  assert.ok(names.size > 5, "generator produced too few distinct names to prove anything");
});

// ── C1: read-first profile ───────────────────────────────────────────────

const PROFILE = { id: "p1", display_name: "Ann", emoji: null, color: "#34363b" };

test("an existing profile costs one read and no ensure RPC", async () => {
  const f = fakeDb(() => ({ data: PROFILE, error: null }));
  assert.deepEqual(await ensureOwnProfile(f.db, "u1", "ann"), PROFILE);
  assert.equal(f.rpcs.length, 0, "ensure_authenticated_profile ran for an account that already has a profile");
  assert.equal(f.log.length, 1);
  assert.ok(f.log[0].calls.some(([m, a]) => m === "eq" && a[0] === "auth_user_id" && a[1] === "u1"));
});

test("a first-time user gets the profile created, then read back", async () => {
  let reads = 0;
  const f = fakeDb(() => (++reads === 1 ? { data: null, error: null } : { data: PROFILE, error: null }));
  f.setRpc({ data: "p1", error: null });
  assert.deepEqual(await ensureOwnProfile(f.db, "u1", "ann"), PROFILE);
  assert.deepEqual(f.rpcs, [{ name: "ensure_authenticated_profile", args: { p_display_name: "ann" } }]);
});

test("a failed read falls through to the RPC rather than reading as 'no profile'", async () => {
  let reads = 0;
  const f = fakeDb(() => (++reads === 1 ? { data: null, error: { code: "500" } } : { data: null, error: { code: "500" } }));
  f.setRpc({ data: "p1", error: null });
  // The RPC's id survives even when the re-read fails too -- the old page did the same.
  assert.deepEqual(await ensureOwnProfile(f.db, "u1", "ann"), { id: "p1", display_name: null, emoji: null, color: null });
  assert.equal(f.rpcs.length, 1);
});

test("a refused RPC (guest / no permanent account) is null, not an invented profile", async () => {
  const f = fakeDb(() => ({ data: null, error: null }));
  f.setRpc({ data: null, error: { code: "42501" } });
  assert.equal(await ensureOwnProfile(f.db, "u1", "ann"), null);
});
