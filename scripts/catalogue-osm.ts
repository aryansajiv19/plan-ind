// Grows the curated catalogue from OpenStreetMap (migrations 089 and 090),
// with a human pick in the middle.
//
//   node --experimental-strip-types --import ./tests/register-aliases.mjs scripts/catalogue-osm.ts --review
//     Overpass (Dubai + Hatta) -> the rules in lib/catalogue/osm.ts -> ~300 of
//     the best-kept candidates, spread, the thin categories weighted up, each
//     with a proposed vibe (OSM description=, else the venue's own site).
//     Writes data/catalogue-089.json (the source of truth, committed) and
//     scripts/catalogue-089.review.local.csv (for reading). Re-running keeps
//     every reviewer field (approved, vibe_final, reject_reason) by id.
//   ... scripts/catalogue-osm.ts --pool 090
//     The same over the wider districts: ~1,500 candidates, none already live
//     or in 089 (approved or rejected), split into data/catalogue-090-part1..4
//     .json by part090 (dinner east, dinner west, cafes and sweets, the rest).
//     Re-running keeps every reviewer field by id.
//   ... scripts/catalogue-osm.ts --add [090] node/123 way/456=shisha ...
//     Hand-picked OSM objects (for categories OSM rarely tags, like shisha,
//     beach clubs and live music): the same rules, an optional forced
//     category, appended to the review unapproved (to 089, or with 090 to the
//     right 090 part). Existing rows are untouched.
//   ... scripts/catalogue-osm.ts --sql [090]
//     Emits the batch's migration from APPROVED rows only; each needs
//     vibe_final. Refuses otherwise, and 090 refuses any row 089 already has.
//
// Google has no part in it. Overpass is asked once (OVERPASS_URL overrides the
// server when overpass-api.de is down; OVERPASS_FILE reads a saved response's
// elements instead); venue sites at most 4 at a time, with
// a real User-Agent and an 8 s timeout.

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidatesFrom, selectSpread, type CatalogueRow, type OsmElement } from "../lib/catalogue/osm.ts";
import { catalogueSql } from "../lib/catalogue/sql.ts";
import { approvedRecords, idFor, parseAddArg, part090, pool090, type Batch, type ReviewRow } from "../lib/catalogue/review.ts";
import { cleanVibe, siteMeta, USER_AGENT } from "./catalogue-web.ts";

const root = path.resolve(import.meta.dirname, "..");
const BATCHES: Record<Batch, { files: string[]; sql: string; title: string }> = {
  "089": { files: ["data/catalogue-089.json"], sql: "supabase/migration-089-catalogue-growth.sql", title: "catalogue growth from OpenStreetMap, picked by hand" },
  "090": { files: [1, 2, 3, 4].map((n) => `data/catalogue-090-part${n}.json`), sql: "supabase/migration-095-catalogue-growth-2.sql", title: "catalogue growth 2, the wider districts, picked by hand" },
};
const DATA = path.join(root, BATCHES["089"].files[0]);
const REVIEW_SIZE = 300;
/** Thin in the catalogue today: these take every good candidate, others a fair share. */
const THIN = new Set(["padel", "karaoke", "escape", "games", "wellness", "beach_club", "shisha", "movie"]);
const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const BOXES = ["24.93,54.98,25.36,55.62", "24.74,56.03,24.87,56.22"]; // Dubai; Hatta
const FILTERS = [
  'nwr["amenity"~"^(restaurant|cafe|bar|pub|nightclub|cinema|theatre|arts_centre|ice_cream|hookah_lounge|music_venue|karaoke_box|spa)$"]',
  'nwr["leisure"~"^(sports_centre|water_park|escape_game|bowling_alley|amusement_arcade|trampoline_park|park|nature_reserve|beach_resort|spa|indoor_play|miniature_golf|ice_rink|golf_course)$"]',
  'nwr["tourism"~"^(museum|gallery|zoo|aquarium|theme_park)$"]',
  'nwr["shop"="mall"]',
  'nwr["natural"="beach"]["name"]',
  'nwr["sport"~"padel|climbing|karting|skydiving"]',
];

async function overpass(): Promise<OsmElement[]> {
  // A saved response (the `elements` array) for when every Overpass server is timing out.
  if (process.env.OVERPASS_FILE) return JSON.parse(await readFile(process.env.OVERPASS_FILE, "utf8")) as OsmElement[];
  const body = `[out:json][timeout:180];(${BOXES.flatMap((box) => FILTERS.map((f) => `${f}["name"](${box});`)).join("")});out center tags;`;
  const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(body)}` });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  return ((await res.json()) as { elements: OsmElement[] }).elements;
}

/** Every place name the catalogue already has: the seed, the venue facts, and every migration's inserts. */
async function existingNames(): Promise<string[]> {
  const facts = JSON.parse(await readFile(path.join(root, "data/venue-facts.json"), "utf8")) as { venues?: { name?: string }[] };
  const sqlFiles = ["supabase/seed.sql", ...(await readdir(path.join(root, "supabase"))).filter((f) => /^migration-\d+.*\.sql$/.test(f)).map((f) => `supabase/${f}`)];
  const sql = (await Promise.all(sqlFiles.map((f) => readFile(path.join(root, f), "utf8")))).join("\n");
  return [...(facts.venues ?? []).map((v) => v.name ?? ""), ...[...sql.matchAll(/\('[0-9a-f-]{36}',\s*'((?:[^']|'')+)'/g)].map((m) => m[1].replace(/''/g, "'"))];
}

/** Review rows for picks, each with a proposed vibe; reviewer fields kept by id. */
async function reviewRows(picks: readonly CatalogueRow[], tagsOf: ReadonlyMap<string, Record<string, string>>, previous: ReadonlyMap<string, ReviewRow>, batch: Batch = "089") {
  const rows: ReviewRow[] = [];
  const queue = [...picks];
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const tags = tagsOf.get(row.osmRef) ?? {};
      const fromOsm = cleanVibe(tags.description);
      const fromSite = fromOsm || !row.website ? null : (await siteMeta(row.website))?.description ?? null;
      const id = idFor(row.osmRef, batch);
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
  return rows;
}

async function readData(file = DATA): Promise<ReviewRow[]> {
  try {
    return (JSON.parse(await readFile(file, "utf8")) as { rows: ReviewRow[] }).rows;
  } catch {
    return [];
  }
}

const readBatch = async (batch: Batch) => (await Promise.all(BATCHES[batch].files.map((f) => readData(path.join(root, f))))).flat();

const writeData = (rows: readonly ReviewRow[], file = DATA) =>
  writeFile(file, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "OpenStreetMap (ODbL); proposed vibes from OSM or each venue's own site", rows }, null, 1)}\n`);

/** 090's rows into their four part files, each sorted for reading. */
async function write090(rows: readonly ReviewRow[]) {
  for (const [i, file] of BATCHES["090"].files.entries()) {
    const part = rows.filter((r) => part090(r) === i + 1)
      .sort((a, b) => a.category.localeCompare(b.category) || a.district.localeCompare(b.district) || b.upkeep - a.upkeep || a.name.localeCompare(b.name));
    await writeData(part, path.join(root, file));
  }
}

async function add(allArgs: readonly string[]) {
  const batch: Batch = allArgs[0] === "090" ? "090" : "089";
  const args = batch === "090" ? allArgs.slice(1) : allArgs;
  const parsed = args.map((arg) => ({ arg, add: parseAddArg(arg) }));
  const bad = parsed.filter((p) => !p.add).map((p) => p.arg);
  if (bad.length) throw new Error(`not an OSM ref (node/123, way/456=shisha): ${bad.join(", ")}`);
  const wanted = parsed.map((p) => p.add!);
  const forced = new Map(wanted.filter((w) => w.category).map((w) => [w.ref, w.category!]));
  const query = `[out:json][timeout:60];(${wanted.map((w) => `${w.ref.replace("/", "(")});`).join("")});out center tags;`;
  const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(query)}` });
  if (!res.ok) throw new Error(`Overpass answered ${res.status}`);
  const elements = ((await res.json()) as { elements: OsmElement[] }).elements;
  const found = new Set(elements.map((el) => `${el.type}/${el.id}`));
  for (const w of wanted) if (!found.has(w.ref)) console.log(`${w.ref}: not found on OpenStreetMap`);

  const existing = await readBatch(batch);
  const known = new Set([...existing, ...(batch === "090" ? await readBatch("089") : [])].map((row) => row.osm));
  const { kept, skipped } = candidatesFrom(elements.filter((el) => !known.has(`${el.type}/${el.id}`)), await existingNames(), forced);
  for (const el of elements) if (known.has(`${el.type}/${el.id}`)) console.log(`${el.type}/${el.id}: already in the review`);
  for (const s of skipped) console.log(`${s.ref} ${s.name}: skipped, ${s.reason}`);
  const tagsOf = new Map(elements.map((el) => [`${el.type}/${el.id}`, el.tags ?? {}]));
  const added = await reviewRows(kept, tagsOf, new Map(), batch);
  await (batch === "090" ? write090([...existing, ...added]) : writeData([...existing, ...added]));
  for (const row of added) console.log(`${row.osm} ${row.name}: added as ${row.category} in ${row.area} (${row.id}), unapproved`);
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

  const rows = await reviewRows(picks, tagsOf, previous);
  rows.sort((a, b) => a.category.localeCompare(b.category) || b.upkeep - a.upkeep || a.name.localeCompare(b.name));

  await writeData(rows);
  const cols: (keyof ReviewRow)[] = ["id", "approved", "name", "category", "area", "district", "cuisine", "osm_url", "website", "opening_hours", "open_till", "minimum_age", "upkeep", "proposed_vibe", "proposed_vibe_source", "vibe_final", "reject_reason"];
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  await writeFile(path.join(root, "scripts/catalogue-089.review.local.csv"), `${csv}\n`);
  await writeFile(path.join(root, "scripts/catalogue-089-skipped.local.json"), `${JSON.stringify(skipped, null, 1)}\n`);

  const count = (key: (r: ReviewRow) => string) => Object.fromEntries([...rows.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>())].sort());
  console.log(`elements ${elements.length}, candidates ${kept.length}, review rows ${rows.length}, with a proposed vibe ${rows.filter((r) => r.proposed_vibe).length}`);
  console.log("by category", count((r) => r.category));
  console.log("by district", count((r) => r.district));
}

async function pool() {
  const elements = await overpass();
  const tagsOf = new Map(elements.map((el) => [`${el.type}/${el.id}`, el.tags ?? {}]));
  const in089 = await readBatch("089");
  const taken = new Set(in089.map((row) => row.osm));
  const { kept, skipped } = candidatesFrom(elements.filter((el) => !taken.has(`${el.type}/${el.id}`)), [...await existingNames(), ...in089.map((row) => row.name)]);
  const previous = new Map((await readBatch("090")).map((row) => [row.id, row]));
  const rows = await reviewRows(pool090(kept), tagsOf, previous, "090");
  await write090(rows);
  await writeFile(path.join(root, "scripts/catalogue-090-skipped.local.json"), `${JSON.stringify(skipped, null, 1)}\n`);

  const count = (list: readonly ReviewRow[], key: (r: ReviewRow) => string) => Object.fromEntries([...list.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>())].sort());
  console.log(`elements ${elements.length}, candidates ${kept.length}, pool ${rows.length}, with a proposed vibe ${rows.filter((r) => r.proposed_vibe).length}, with a website ${rows.filter((r) => r.website).length}`);
  for (const n of [1, 2, 3, 4]) {
    const part = rows.filter((r) => part090(r) === n);
    console.log(`part${n}: ${part.length}`, count(part, (r) => r.category));
  }
  console.log("by district", count(rows, (r) => r.district));
}

const header = (batch: Batch) => `-- Migration ${BATCHES[batch].sql.match(/migration-(\d+)/)![1]}: ${BATCHES[batch].title}.
--
-- STAGED -- generated, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
-- Generated by scripts/catalogue-osm.ts --sql${batch === "089" ? "" : ` ${batch}`} from the APPROVED rows of
-- ${BATCHES[batch].files.join(", ")}; never hand-edit: change the review and re-run.
--
-- Every stored fact is from OpenStreetMap (ODbL, credited on /credits), the
-- venue's own website, or authored by us (category, area, the cuisine label
-- when OSM has none, minimum age from our category policy, and the vibe line
-- where the reviewer wrote it). Nothing from Google: google_place_id stays
-- null (the matcher attaches it later), and no Google names, ratings, prices
-- or photos. Unknown stays unknown: price_band null (made nullable ${batch === "089" ? "here" : "in 089"}: no
-- made-up bands), min_spend 0 and open_till '' (the app's existing "unknown"
-- conventions). facts_sources records each row's sources. Idempotent: fixed
-- ids in the c${batch}0000- range, on conflict do nothing.

begin;

alter table spots alter column price_band drop not null;

`;

const argAfter = (flag: string) => process.argv[process.argv.indexOf(flag) + 1];

if (process.argv.includes("--sql")) {
  const batch: Batch = argAfter("--sql") === "090" ? "090" : "089";
  const rows = await readBatch(batch);
  if (batch === "090") {
    const in089 = new Set((await readBatch("089")).map((row) => row.osm));
    const clash = rows.filter((row) => in089.has(row.osm) || !row.id.startsWith("c0900000-")).map((row) => `${row.id} ${row.name}`);
    if (clash.length) throw new Error(`already in 089, or not a 090 id:\n  ${clash.join("\n  ")}`);
  }
  const records = approvedRecords(rows);
  if (records.length === 0) throw new Error("nothing approved yet");
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(root, BATCHES[batch].sql), `${header(batch)}${catalogueSql(records, today)}\ncommit;\n`);
  console.log(`wrote ${batch} with ${records.length} approved rows`);
} else if (process.argv.includes("--review")) {
  await review();
} else if (argAfter("--pool") === "090") {
  await pool();
} else if (process.argv.includes("--add")) {
  await add(process.argv.slice(process.argv.indexOf("--add") + 1));
} else {
  console.log("usage: --review | --pool 090 | --add [090] node/123 [way/456=shisha ...] | --sql [090]");
}
