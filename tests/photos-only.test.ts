// Owner (2026-10-01): a curated place is only listed or dealt when it can show
// a real photo -- our own (photo_url) or a matched Google place's. These fail
// if any listing path stops applying that rule.
import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dealFromPool, eligibleCount, type DealSpotRow } from "../lib/spots/match.ts";
import { photoCheck } from "../lib/spots/deal-spots.ts";
import { listableToday } from "../lib/venue-facts.ts";
import { REAL_PHOTO_FILTER, hasRealPhoto } from "../lib/venue-photo.ts";

const spot = (id: string, photo: Partial<DealSpotRow>): DealSpotRow => ({
  id, name: `Spot ${id}`, category: "dinner", area: "Dubai Marina", cuisine: "Grill", min_spend: 100, vibe: "relaxed",
  description: null, latitude: null, longitude: null, minimum_age: null, ...photo,
});
const stored = (id: string) => spot(id, { photo_url: `https://photos.test/${id}.jpg` });
const matched = (id: string) => spot(id, { google_place_id: `ChIJmatched${id}00` });
const bare = (id: string) => spot(id, {});

test("a place with no photo and no matched place is never dealt; stored-photo and matched places are", () => {
  const pool = [...Array.from({ length: 5 }, (_, i) => stored(`s${i}`)), ...Array.from({ length: 4 }, (_, i) => matched(`m${i}`)), bare("x"), bare("y")];
  assert.equal(eligibleCount(pool, {}, "2026-10-01"), 9, "the preview counts only the nine with photos");
  for (let seed = 0; seed < 20; seed++) {
    const ids = dealFromPool({ category: "dinner", count: 9, pool, ratings: [], constraints: {}, today: "2026-10-01", rng: () => (seed + 0.5) / 20 });
    assert.ok(ids, "nine with photos are enough for a deal");
    assert.ok(!ids.includes("x") && !ids.includes("y"), `seed ${seed} dealt a photo-less place`);
  }
  assert.equal(dealFromPool({ category: "dinner", count: 9, pool: pool.filter((s) => s.id !== "s0"), ratings: [], constraints: {}, today: "2026-10-01" }), null,
    "eight with photos plus two without is too few, not a deal padded with blanks");
});

test("every client listing read carries the photo rule for curated rows only (custom places are the host's own)", () => {
  const filters: string[] = [];
  const query = { or(f: string) { filters.push(f); return query; } };
  listableToday(query, "2026-10-01");
  assert.ok(filters.includes(`source.neq.curated,${REAL_PHOTO_FILTER}`), filters.join(" | "));
  assert.equal(REAL_PHOTO_FILTER, "photo_url.not.is.null,google_place_id.not.is.null", "the SQL form of hasRealPhoto");
  assert.equal(hasRealPhoto({ id: "a", photo_url: null, photo_attribution: null, google_place_id: null }), false);
});

test("plan create refuses a hand-built request carrying a photo-less curated place; a failed check is not a pass", async () => {
  const db = (result: { data: unknown; error: unknown }) => ({
    from: () => ({ select: () => ({ in: async () => result }) }),
  }) as unknown as SupabaseClient;
  const row = (id: string, source: string, photo_url: string | null, google_place_id: string | null) => ({ id, source, photo_url, google_place_id });
  assert.equal(await photoCheck(db({ data: [row("a", "curated", "https://p.test/a.jpg", null), row("b", "curated", null, "ChIJb00000000")], error: null }), ["a", "b"]), "ok");
  assert.equal(await photoCheck(db({ data: [row("a", "curated", "https://p.test/a.jpg", null), row("c", "curated", null, null)], error: null }), ["a", "c"]), "photoless");
  assert.equal(await photoCheck(db({ data: [row("d", "custom", null, null)], error: null }), ["d"]), "ok", "a host's own custom place passes");
  assert.equal(await photoCheck(db({ data: null, error: { message: "down" } }), ["a"]), "unavailable");
});
