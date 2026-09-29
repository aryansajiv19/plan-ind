// Grows the curated catalogue from OpenStreetMap (migration 089), with a
// human pick in the middle.
//
//   node --experimental-strip-types --import ./tests/register-aliases.mjs scripts/catalogue-osm.ts --review
//     Overpass (Dubai + Hatta) -> the rules in lib/catalogue/osm.ts -> ~300 of
//     the best-kept candidates, spread, the thin categories weighted up, each
//     with a proposed vibe (OSM description=, else the venue's own site).
//     Writes data/catalogue-089.json (the source of truth, committed) and
//     scripts/catalogue-089.review.local.csv (for reading). Re-running keeps
//     every reviewer field (approved, vibe_final, reject_reason) by id.
//   ... scripts/catalogue-osm.ts --sql
//     Emits supabase/migration-089-catalogue-growth.sql from APPROVED rows
//     only; each needs vibe_final. Refuses otherwise.
//
// Google has no part in it. Overpass is asked once; venue sites at most 4 at
// a time, with a real User-Agent and an 8 s timeout.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidatesFrom, selectSpread, type CatalogueRow, type OsmElement } from "../lib/catalogue/osm.ts";
import { catalogueSql } from "../lib/catalogue/sql.ts";
import { approvedRecords, idFor, type ReviewRow } from "../lib/catalogue/review.ts";
import { cleanVibe, siteMeta, USER_AGENT } from "./catalogue-web.ts";

const root = path.resolve(import.meta.dirname, "..");
const DATA = path.join(root, "data/catalogue-089.json");
const REVIEW_SIZE = 300;
/** Thin in the catalogue today: these take every good candidate, others a fair share. */
const THIN = new Set(["padel", "karaoke", "escape", "games", "wellness", "beach_club", "shisha", "movie"]);
const OVERPASS = "https://overpass-api.de/api/interpreter";
const BOXES = ["24.93,54.98,25.36,55.62", "24.74,56.03,24.87,56.22"]; // Dubai; Hatta
const FILTERS = [
  'nwr["amenity"~"^(restaurant|cafe|bar|pub|nightclub|cinema|theatre|arts_centre|ice_cream|hookah_lounge|music_venue|karaoke_box|spa)$"]',
  'nwr["leisure"~"^(sports_centre|water_park|escape_game|bowling_alley|amusement_arcade|trampoline_park|park|nature_reserve|beach_resort|spa)$"]',
  'nwr["tourism"~"^(museum|gallery|zoo|aquarium|theme_park)$"]',
  'nwr["shop"="mall"]',
  'nwr["natural"="beach"]["name"]',
  'nwr["sport"~"padel|climbing|karting|skydiving"]',
];

async function overpass(): Promise<OsmElement[]> {
  const body = `[out:json][timeout:180];(${BOXES.flatMap((box) => FILTERS.map((f) => `${f}["name"](${box});`)).join("")});out center tags;`;
  const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(body)}` });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  return ((await res.json()) as { elements: OsmElement[] }).elements;
}

async function existingNames(): Promise<string[]> {
  const facts = JSON.parse(await readFile(path.join(root, "data/venue-facts.json"), "utf8")) as { venues?: { name?: string }[] };
  const seed = await readFile(path.join(root, "supabase/seed.sql"), "utf8");
  return [...(facts.venues ?? []).map((v) => v.name ?? ""), ...[...seed.matchAll(/\('[0-9a-f-]{36}',\s*'([^']+)'/g)].map((m) => m[1])];
}

async function review() {
  const elements = await overpass();
  const tagsOf = new Map(elements.map((el) => [`${el.type}/${el.id}`, el.tags ?? {}]));
  const { kept, skipped } = candidatesFrom(elements, await existingNames());
  // Thin categories take every candidate; the rest share what's left.
  const thin = kept.filter((row) => THIN.has(row.category));
  const rest = selectSpread(kept.filter((row) => !THIN.has(row.category)), Math.max(0, REVIEW_SIZE - thin.length), 20);
  const picks: CatalogueRow[] = [...selectSpread(thin, thin.length, Number.POSITIVE_INFINITY), ...rest];

  const previous = new Map<string, ReviewRow>();
  try {
    for (const row of (JSON.parse(await readFile(DATA, "utf8")) as { rows: ReviewRow[] }).rows) previous.set(row.id, row);
  } catch { /* first run */ }

  const rows: ReviewRow[] = [];
  const queue = [...picks];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const tags = tagsOf.get(row.osmRef) ?? {};
      const fromOsm = cleanVibe(tags.description);
      const fromSite = fromOsm || !row.website ? null : (await siteMeta(row.website))?.description ?? null;
      const id = idFor(row.osmRef);
      const before = previous.get(id);
      rows.push({
        id, osm: row.osmRef, osm_url: `https://www.openstreetmap.org/${row.osmRef}`, name: row.name, category: row.category,
        area: row.area, district: row.district, cuisine: row.cuisine, latitude: row.latitude, longitude: row.longitude,
        opening_hours: tags.opening_hours ?? null, open_till: row.openTill, website: row.website, minimum_age: row.minimumAge,
        upkeep: row.score, proposed_vibe: fromOsm ?? fromSite, proposed_vibe_source: fromOsm ? "osm:description" : fromSite ? row.website : null,
        approved: before?.approved ?? false, vibe_final: before?.vibe_final ?? null, reject_reason: before?.reject_reason ?? null,
      });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  rows.sort((a, b) => a.category.localeCompare(b.category) || b.upkeep - a.upkeep || a.name.localeCompare(b.name));

  await writeFile(DATA, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "OpenStreetMap (ODbL); proposed vibes from OSM or each venue's own site", rows }, null, 1)}\n`);
  const cols: (keyof ReviewRow)[] = ["id", "approved", "name", "category", "area", "district", "cuisine", "osm_url", "website", "opening_hours", "open_till", "minimum_age", "upkeep", "proposed_vibe", "proposed_vibe_source", "vibe_final", "reject_reason"];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  await writeFile(path.join(root, "scripts/catalogue-089.review.local.csv"), `${csv}\n`);
  await writeFile(path.join(root, "scripts/catalogue-089-skipped.local.json"), `${JSON.stringify(skipped, null, 1)}\n`);

  const count = (key: (r: ReviewRow) => string) => Object.fromEntries([...rows.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>())].sort());
  console.log(`elements ${elements.length}, candidates ${kept.length}, review rows ${rows.length}, with a proposed vibe ${rows.filter((r) => r.proposed_vibe).length}`);
  console.log("by category", count((r) => r.category));
  console.log("by district", count((r) => r.district));
}

const HEADER = `-- Migration 089: catalogue growth from OpenStreetMap, picked by hand.
--
-- STAGED -- generated, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
-- Generated by scripts/catalogue-osm.ts --sql from the APPROVED rows of
-- data/catalogue-089.json; never hand-edit: change the review and re-run.
--
-- Every stored fact is from OpenStreetMap (ODbL, credited on /credits), the
-- venue's own website, or authored by us (category, area, the cuisine label
-- when OSM has none, minimum age from our category policy, and the vibe line
-- where the reviewer wrote it). Nothing from Google: google_place_id stays
-- null (the matcher attaches it later), and no Google names, ratings, prices
-- or photos. Unknown stays unknown: price_band null (made nullable here: no
-- made-up bands), min_spend 0 and open_till '' (the app's existing "unknown"
-- conventions). facts_sources records each row's sources. Idempotent: fixed
-- ids in the c0890000- range, on conflict do nothing.

begin;

alter table spots alter column price_band drop not null;

`;

if (process.argv.includes("--sql")) {
  const data = JSON.parse(await readFile(DATA, "utf8")) as { rows: ReviewRow[] };
  const records = approvedRecords(data.rows);
  if (records.length === 0) throw new Error("nothing approved yet");
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(root, "supabase/migration-089-catalogue-growth.sql"), `${HEADER}${catalogueSql(records, today)}\ncommit;\n`);
  console.log(`wrote 089 with ${records.length} approved rows`);
} else if (process.argv.includes("--review")) {
  await review();
} else {
  console.log("usage: --review | --sql");
}
