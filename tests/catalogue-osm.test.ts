import assert from "node:assert/strict";
import test from "node:test";
import { candidatesFrom, categoryOf, cuisineOf, excluded, openTillFrom, selectSpread } from "../lib/catalogue/osm.ts";
import { catalogueSql, STORED_COLUMNS, websiteUrl, type CatalogueRecord } from "../lib/catalogue/sql.ts";

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

test("--add: OSM refs with an optional forced category; a forced one must be ours, and the other rules still hold", async () => {
  const { parseAddArg } = await import("../lib/catalogue/review.ts");
  assert.deepEqual(parseAddArg("node/123"), { ref: "node/123", category: null });
  assert.deepEqual(parseAddArg("way/456=shisha"), { ref: "way/456", category: "shisha" });
  assert.equal(parseAddArg("node/abc"), null);
  assert.equal(parseAddArg("https://www.openstreetmap.org/node/1"), null);
  const el = (id: number, tags: Record<string, string>) => ({ type: "node" as const, id, lat: 25.08, lon: 55.14, tags });
  const forced = new Map([["node/1", "shisha"], ["node/2", "jetski"], ["node/3", "beach_club"]]);
  const { kept, skipped } = candidatesFrom([
    el(1, { name: "Hookah Place", amenity: "cafe" }),
    el(2, { name: "Odd One", amenity: "cafe" }),
    el(3, { name: "Chain Beach", leisure: "beach_resort", brand: "Chain" }),
  ], [], forced);
  assert.deepEqual(kept.map((k) => [k.name, k.category]), [["Hookah Place", "shisha"]], "a shisha place tagged a cafe lands as shisha");
  assert.deepEqual(skipped.map((s) => s.reason).sort(), ["chain (brand tag)", 'unknown category "jetski"']);
});

test("catalogue ages follow the app's policy: shisha 18, beach clubs 21, karaoke open", async () => {
  const { minimumAgeFor } = await import("@/lib/catalogue/osm");
  assert.deepEqual(["shisha", "beach_club", "nightlife", "vibes", "karaoke", "live_music", "cafe"].map(minimumAgeFor), [18, 21, 21, 21, 0, 21, 0]);
});

test("090: its own id range, four parts that never share a row, dinner and cafes capped per part, the thin rest all kept", async () => {
  const { idFor, part090, pool090 } = await import("../lib/catalogue/review.ts");
  assert.equal(idFor("way/1", "090"), "c0900000-0000-0000-0002-000000000001");
  assert.equal(idFor("way/1"), "c0890000-0000-0000-0002-000000000001", "089's ids unchanged");
  assert.equal(part090({ category: "dinner", district: "Deira & Al Rigga" }), 1);
  assert.equal(part090({ category: "dinner", district: "Marina & JBR" }), 2);
  assert.equal(part090({ category: "dessert", district: "Deira & Al Rigga" }), 3);
  assert.equal(part090({ category: "outdoors", district: "Marina & JBR" }), 4);
  const row = (i: number, category: string, district: string) => ({
    osmRef: `node/${i}`, name: `P${i}`, category, area: "X", district, cuisine: "", latitude: 25, longitude: 55,
    openTill: "", website: null, minimumAge: 0, score: i % 5,
  });
  const kept = [
    ...Array.from({ length: 10 }, (_, i) => row(i, "dinner", i % 2 ? "Deira & Al Rigga" : "Al Nahda & Qusais")),
    ...Array.from({ length: 10 }, (_, i) => row(100 + i, "dinner", "Marina & JBR")),
    ...Array.from({ length: 10 }, (_, i) => row(200 + i, "cafe", "JVC, Sports City & Motor City")),
    row(300, "brunch", "Business Bay"),
    ...Array.from({ length: 7 }, (_, i) => row(400 + i, i % 2 ? "culture" : "sports", "Mirdif & Al Warqa")),
  ];
  const pool = pool090(kept, 4);
  const byPart = [1, 2, 3, 4].map((n) => pool.filter((r) => part090(r) === n).length);
  assert.deepEqual(byPart, [4, 4, 4, 7], "three capped parts, the thin rest all in");
  assert.equal(new Set(pool.map((r) => r.osmRef)).size, pool.length, "no row twice");
  assert.ok(pool.some((r) => r.category === "brunch"), "a thin category in a capped part still gets in");
  const east = pool.filter((r) => part090(r) === 1).map((r) => r.district);
  assert.deepEqual(new Set(east), new Set(["Deira & Al Rigga", "Al Nahda & Qusais"]), "spread across districts");
});

test("090's added tags: indoor play is family, mini golf is games, ice rinks and golf are sports", () => {
  assert.equal(categoryOf({ leisure: "indoor_play" }), "family");
  assert.equal(categoryOf({ leisure: "miniature_golf" }), "games");
  assert.equal(categoryOf({ leisure: "ice_rink" }), "sports");
  assert.equal(categoryOf({ leisure: "golf_course" }), "sports");
});

test("a website reaches the SQL only as http(s), so spots_website_http can't abort the migration", () => {
  assert.equal(websiteUrl("https://a.test/x"), "https://a.test/x");
  assert.equal(websiteUrl("http://a.test"), "http://a.test");
  assert.equal(websiteUrl("clawbbq.com"), "https://clawbbq.com", "OSM's bare domain");
  assert.equal(websiteUrl("www.a.test/menu"), "https://www.a.test/menu");
  assert.equal(websiteUrl("javascript:alert(1)"), null);
  assert.equal(websiteUrl("instagram: @place"), null);
  assert.equal(websiteUrl(" "), null);
  const row: CatalogueRecord = {
    id: "c0900000-0000-0000-0001-000000000001", osmRef: "node/1", name: "C", category: "dinner", area: "JBR", cuisine: "Grill",
    latitude: 25.08, longitude: 55.14, openTill: "", website: "clawbbq.com", minimumAge: 0, vibe: "A grill", vibeSource: "reviewer",
  };
  assert.match(catalogueSql([row], "2026-09-29"), /'https:\/\/clawbbq\.com'/);
});
