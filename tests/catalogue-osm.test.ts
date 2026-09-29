import assert from "node:assert/strict";
import test from "node:test";
import { candidatesFrom, categoryOf, cuisineOf, excluded, openTillFrom, selectSpread } from "../lib/catalogue/osm.ts";
import { catalogueSql, STORED_COLUMNS, type CatalogueRecord } from "../lib/catalogue/sql.ts";

test("OSM tags map to our categories, the most specific first", () => {
  assert.equal(categoryOf({ amenity: "restaurant", cuisine: "italian" }), "dinner");
  assert.equal(categoryOf({ amenity: "cafe", cuisine: "breakfast;coffee_shop" }), "brunch");
  assert.equal(categoryOf({ amenity: "restaurant", cuisine: "ice_cream" }), "dessert");
  assert.equal(categoryOf({ amenity: "bar", live_music: "yes" }), "live_music");
  assert.equal(categoryOf({ leisure: "sports_centre", sport: "padel;tennis" }), "padel");
  assert.equal(categoryOf({ tourism: "museum" }), "culture");
  assert.equal(categoryOf({ shop: "furniture" }), null);
});

test("chains, private and unnamed places are never picks", () => {
  assert.equal(excluded({ name: "Starbucks", brand: "Starbucks" }), "chain (brand tag)");
  assert.equal(excluded({ name: "Club", access: "members" }), "not open to the public");
  assert.equal(excluded({ amenity: "cafe" }), "no name");
  assert.equal(excluded({ name: "Local Spot" }), null);
});

test("one closing time from opening_hours, or unknown", () => {
  assert.equal(openTillFrom("Mo-Su 12:00-24:00"), "12am");
  assert.equal(openTillFrom("Mo-Th 10:00-23:30; Fr-Sa 10:00-23:30"), "11:30pm");
  assert.equal(openTillFrom("Mo-Th 10:00-23:00; Fr-Sa 10:00-02:00"), "", "two closing times: unknown");
  assert.equal(openTillFrom("Mo-Fr 12:00-15:00,18:00-23:00"), "", "split shift: unknown");
  assert.equal(openTillFrom(undefined), "");
  assert.equal(cuisineOf({ cuisine: "italian;pizza;pasta" }, "dinner"), "Italian, pizza");
  assert.equal(cuisineOf({}, "padel"), "Padel club");
});

test("candidates carry the reasons others were dropped; picks spread across categories", () => {
  const el = (id: number, tags: Record<string, string>) => ({ type: "node" as const, id, lat: 25.08, lon: 55.14, tags });
  const { kept, skipped } = candidatesFrom([
    el(1, { name: "A", amenity: "restaurant", website: "https://a.test", opening_hours: "Mo-Su 12:00-23:00" }),
    el(2, { name: "B", amenity: "cafe" }),
    el(3, { name: "C", amenity: "cafe", brand: "Chain" }),
    el(4, { name: "Known", amenity: "cafe" }),
    { type: "node" as const, id: 5, lat: 24.0, lon: 52.0, tags: { name: "Far", amenity: "cafe" } },
  ], ["Known"]);
  assert.deepEqual(kept.map((k) => [k.name, k.category, k.district]), [["A", "dinner", "Marina & JBR"], ["B", "cafe", "Marina & JBR"]]);
  assert.deepEqual(skipped.map((s) => s.reason).sort(), ["already in the catalogue", "chain (brand tag)", "outside our districts"]);
  assert.deepEqual(selectSpread(kept, 1).map((k) => k.name), ["B"], "round-robin starts with the first category by name");
});

test("the SQL stores only our columns: nothing from Google, unknown stays unknown", () => {
  const row: CatalogueRecord = {
    id: "c0890000-0000-0000-0000-000000000001", osmRef: "node/1", name: "O'Neill's", category: "vibes", area: "JBR",
    cuisine: "Bar and lounge", latitude: 25.08, longitude: 55.14, openTill: "", website: null, minimumAge: 21,
    vibe: "A small bar by the beach", vibeSource: "osm:description",
  };
  const sql = catalogueSql([row], "2026-09-29");
  assert.match(sql, new RegExp(`insert into spots \\(${STORED_COLUMNS.join(", ")}\\)`));
  for (const google of ["google_place_id", "rating", "user_ratings", "price_level", "photo_url", "photo_reference", "places.googleapis"]) {
    assert.ok(!sql.includes(google), `no ${google} in the SQL`);
  }
  assert.match(sql, /'O''Neill''s'/, "quotes escaped");
  assert.match(sql, /, null, 0, '', /, "price_band null, min_spend 0, open_till '' (unknown)");
  assert.match(sql, /on conflict \(id\) do nothing/);
});

test("the review: stable ids per OSM object; only approved rows with a final vibe become SQL, each with its vibe's source", async () => {
  const { approvedRecords, idFor } = await import("../lib/catalogue/review.ts");
  assert.equal(idFor("node/622542589"), "c0890000-0000-0000-0001-0000251b3efd");
  assert.equal(idFor("way/1"), "c0890000-0000-0000-0002-000000000001");
  const base = {
    osm: "node/1", osm_url: "https://www.openstreetmap.org/node/1", category: "cafe", area: "JBR", district: "Marina & JBR",
    cuisine: "Cafe", latitude: 25.08, longitude: 55.14, opening_hours: null, open_till: "", website: "https://x.test", minimum_age: 0,
    upkeep: 5, proposed_vibe: "Sea-view terrace for slow coffees", proposed_vibe_source: "https://x.test", reject_reason: null,
  };
  const rows = [
    { ...base, id: "c0890000-0000-0000-0001-000000000001", name: "Kept as proposed", approved: true, vibe_final: "Sea-view terrace for slow coffees" },
    { ...base, id: "c0890000-0000-0000-0001-000000000002", name: "Rewritten", approved: true, vibe_final: "Our own honest line" },
    { ...base, id: "c0890000-0000-0000-0001-000000000003", name: "Not approved", approved: false, vibe_final: "x" },
  ];
  const records = approvedRecords(rows);
  assert.deepEqual(records.map((r) => [r.name, r.vibeSource]), [["Kept as proposed", "https://x.test"], ["Rewritten", "reviewer"]]);
  assert.throws(() => approvedRecords([{ ...rows[0], vibe_final: " " }]), /approved without vibe_final/);
  assert.throws(() => approvedRecords([{ ...rows[0], reject_reason: "closed" }]), /approved and rejected/);
  const sql = catalogueSql(records, "2026-09-29");
  assert.match(sql, /-- Rewritten · cafe · JBR · vibe: reviewer/);
  assert.match(sql, /Written by the plan-ind reviewer/);
});
