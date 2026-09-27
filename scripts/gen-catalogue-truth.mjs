// Generates supabase/migration-070-catalogue-truth.sql from data/venue-facts.json.
// Never hand-edit the migration: change the data or this script and re-run
//   node scripts/gen-catalogue-truth.mjs
// Rules (owner/lead decisions, 2026-09-27):
//   - only non-null values are written; unknown stays as it is (null)
//   - a field any checker note names is NOT written (it didn't survive the
//     check); lat/lng go as a pair, and the nearest station with them;
//     "sources[N]" drops that one source; notes on fields we don't store are
//     ignored
//   - good_to_know is skipped where it is a note to us, not to a guest
//     (closed or unverified venues)
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const facts = JSON.parse(readFileSync(new URL("data/venue-facts.json", root), "utf8"));
const OUT = new URL("supabase/migration-070-catalogue-truth.sql", root);

const PERMANENTLY_CLOSED = {
  "81000000-0000-0000-0000-000000000003": "SKY2.0 Dubai",
  "30000000-0000-0000-0000-000000000002": "Terra Solis",
  "8b000000-0000-0000-0000-000000000003": "Anantara World Islands Dubai",
  "83000000-0000-0000-0000-000000000003": "O Beach Dubai",
};
const REOPENS_ON = {
  "87000000-0000-0000-0000-000000000003": ["Museum of the Future", "2027-04-01"],
  "83000000-0000-0000-0000-000000000002": ["Twiggy by La Cantine", "2026-12-31"],
  "8a000000-0000-0000-0000-000000000002": ["Dubai Safari Park", "2026-10-31"],
  "8b000000-0000-0000-0000-000000000002": ["Hatta Dome Park", "2026-09-28"],
};
// good_to_know here is a research note, not guest-facing text.
const UNVERIFIED = { "Scoopi Cafe": true, "Garage Dubai": true };

const byId = new Map(facts.venues.map((v) => [v.id, v]));
for (const [id, name] of [...Object.entries(PERMANENTLY_CLOSED), ...Object.entries(REOPENS_ON).map(([id, [n]]) => [id, n])]) {
  if (byId.get(id)?.name !== name) throw new Error(`closure list: ${id} is not ${name} in the facts file`);
}

// age_limit (P20): a hard, venue-wide minimum becomes minimum_age -- raised,
// never lowered; anything conditional ("under-21s need a parent", pool-only,
// kids' hours) is a guest note instead. Only a clear minimum above the
// youngest account age (13) is hard; "5+"-style limits don't gate anyone here.
const HARD_AGE = [
  /^(\d{2})\+(?: \([^)]*\))?(?: for brunch)?$/, // "21+", "18+ (valid ID required)", "21+ for brunch"
  /^No children under (\d{2})$/,                // "No children under 14"
];
function hardMinimumAge(text) {
  for (const re of HARD_AGE) {
    const m = text.trim().match(re);
    if (m && Number(m[1]) > 13 && Number(m[1]) <= 21) return Number(m[1]);
  }
  return null;
}

// Which field a source supports (P20), so the client links a fact to its
// source without guessing. First match wins, in this order; the patterns are
// the ones the client used (lib/venue-facts.ts), mapped to column names.
const SOURCE_FIELDS = [
  ["minimum_age", /\bage\b|\b(1[2-8]|21)\+|under-?\d|adults? only|over 21/i],
  ["licensed", /licen|alcohol|beer|wine|cocktail|spirits|champagne|happy hour/i],
  ["dress_code", /dress/i],
  ["reservations", /book|reserv|walk-in/i],
  ["parking", /park|valet/i],
  ["halal_friendly", /halal|pork/i],
  ["vegetarian_options", /vegetarian|vegan/i],
  ["phone", /phone|tel\b|\+971|\b0\d[\s-]?\d/i],
  ["spend_pp_aed", /AED|Dhs|price|menu|package/i],
  ["nearest_station", /\bmetro\b|\btram\b|station/i],
  ["address", /coordinat|openstreetmap|\bOSM\b|address|located|location/i],
  ["website", /website|official site/i],
];
const fieldFor = (fact) => SOURCE_FIELDS.find(([, re]) => re.test(fact))?.[0] ?? "good_to_know";

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const counts = { venues: 0, updated: 0, fields: 0, skippedByChecker: 0, sourcesDropped: 0, stations: 0, minimumAges: 0, ageNotes: 0 };
const flagged = [];
const updates = [];

for (const v of facts.venues) {
  counts.venues += 1;
  const blocked = new Set();
  const droppedSources = new Set();
  for (const note of v.checker_notes ?? []) {
    const target = note.slice(0, note.indexOf(":"));
    const idx = target.match(/^sources\[(\d+)\]/);
    if (idx) { droppedSources.add(Number(idx[1])); continue; }
    const field = target.match(/^[a-z_/]+/)?.[0];
    if (!field || field === "sources") continue;
    if (["lat", "lng", "lat/lng"].includes(field)) blocked.add("coords");
    else blocked.add(field);
  }

  const set = [];
  const put = (column, field, value, sql = lit(value)) => {
    if (value === null || value === undefined || value === "") return;
    if (blocked.has(field)) { counts.skippedByChecker += 1; return; }
    set.push(`${column} = ${sql}`);
  };
  const internalNote = PERMANENTLY_CLOSED[v.id] || REOPENS_ON[v.id] || UNVERIFIED[v.name];

  put("address", "address", v.address);
  if (v.lat != null && v.lng != null) {
    if (blocked.has("coords")) counts.skippedByChecker += 1;
    else set.push(`latitude = ${Number(v.lat)}`, `longitude = ${Number(v.lng)}`);
  }
  put("phone", "phone", v.phone);
  if (v.website && !/^https?:\/\//.test(v.website)) throw new Error(`${v.name}: website is not http(s): ${v.website}`);
  put("website", "website", v.website);
  put("licensed", "licensed", v.licensed, String(v.licensed));
  put("dress_code", "dress_code", v.dress_code);
  put("parking", "parking", v.parking);
  put("reservations", "reservations", v.reservations);
  put("halal_friendly", "halal_friendly", v.halal_friendly, String(v.halal_friendly));
  put("vegetarian_options", "vegetarian_options", v.vegetarian_options, String(v.vegetarian_options));
  put("spend_pp_aed", "spend_pp_aed", v.spend_pp_aed);
  const ageText = !blocked.has("age_limit") && typeof v.age_limit === "string" ? v.age_limit.trim() : "";
  const hardAge = ageText ? hardMinimumAge(ageText) : null;
  if (hardAge) {
    set.push(`minimum_age = greatest(coalesce(minimum_age, 0), ${hardAge})`);
    counts.minimumAges += 1;
  }
  const ageNote = ageText && !hardAge ? `Age: ${ageText.replace(/\.?$/, ".")}` : null;
  if (!internalNote) {
    const note = blocked.has("good_to_know") ? null : v.good_to_know;
    if (v.good_to_know && blocked.has("good_to_know")) counts.skippedByChecker += 1;
    const text = [note, ageNote].filter(Boolean).join(" ");
    if (text) set.push(`good_to_know = ${lit(text)}`);
    if (ageNote) counts.ageNotes += 1;
  } else if (v.good_to_know) flagged.push(`${v.name}: good_to_know not written (a research note, not guest text)`);

  const station = v.nearest_station;
  if (station && !blocked.has("coords") && !blocked.has("nearest_station")) {
    set.push(`nearest_station = ${lit(station.name)}`, `station_line = ${lit(station.line)}`);
    if (station.walk_min != null) set.push(`station_walk_min = ${Number(station.walk_min)}`);
    counts.stations += 1;
  }

  // A few records carry a bare string instead of a list: not {fact, url}
  // provenance, so nothing is written for them.
  const raw = Array.isArray(v.sources) ? v.sources : [];
  if (!Array.isArray(v.sources) && v.sources) flagged.push(`${v.name}: sources is not a list; none written`);
  const sources = raw.filter((_, i) => !droppedSources.has(i))
    .filter((s) => s && typeof s.fact === "string" && /^https?:\/\//.test(s.url ?? ""))
    .map((s) => ({ field: fieldFor(s.fact), fact: s.fact, url: s.url }));
  counts.sourcesDropped += raw.length - sources.length;
  if (set.length === 0 && sources.length === 0) continue;
  set.push(`facts_checked_on = ${lit(facts.generated)}`);
  if (sources.length) set.push(`facts_sources = ${lit(JSON.stringify(sources))}::jsonb`);

  counts.updated += 1;
  counts.fields += set.length;
  updates.push(`-- ${v.name.replace(/\n/g, " ")}\nupdate spots set\n  ${set.join(",\n  ")}\nwhere id = '${v.id}' and source = 'curated';`);
}

const closures = [
  ...Object.entries(PERMANENTLY_CLOSED).map(([id, name]) =>
    `update spots set visibility = 'private' where id = '${id}' and source = 'curated'; -- ${name}: permanently closed`),
  ...Object.entries(REOPENS_ON).map(([id, [name, date]]) =>
    `update spots set reopens_on = '${date}' where id = '${id}' and source = 'curated'; -- ${name}`),
];

const sql = `-- Migration 070: catalogue truth. STAGED -- written, not applied anywhere.
-- GENERATED by scripts/gen-catalogue-truth.mjs from data/venue-facts.json
-- (research generated ${facts.generated}). Do not edit by hand: change the data or the
-- script and re-run it.
--
-- ${counts.venues} venues read; ${counts.updated} updated with ${counts.fields} field values;
-- ${counts.skippedByChecker} values withheld because a checker note flagged them;
-- ${counts.sourcesDropped} source entries dropped (flagged or without an http(s) url);
-- ${counts.stations} nearest stations written; ${counts.minimumAges} hard age limits raised
-- minimum_age (never lowered); ${counts.ageNotes} conditional age rules added to good_to_know.
-- Every facts_sources entry is {field, fact, url}: the column it supports.
--
-- Closures: permanently closed venues become visibility 'private' (on a curated
-- row that means retired: the deal pool, the wall and Discover skip it, and
-- plans that already hold it still read it). Temporarily closed venues get
-- reopens_on and are skipped until that date (Dubai calendar day).
-- These are our own sourced facts, not Google Places content. Only curated
-- rows may carry them (spots_custom_no_facts).

-- ── Columns ──────────────────────────────────────────────────────────────────
alter table spots add column if not exists reopens_on date;
alter table spots add column if not exists phone text;
alter table spots add column if not exists website text;
alter table spots add column if not exists licensed boolean;
alter table spots add column if not exists dress_code text;
alter table spots add column if not exists parking text;
alter table spots add column if not exists reservations text;
alter table spots add column if not exists halal_friendly boolean;
alter table spots add column if not exists vegetarian_options boolean;
alter table spots add column if not exists spend_pp_aed text;
alter table spots add column if not exists good_to_know text;
alter table spots add column if not exists nearest_station text;
alter table spots add column if not exists station_line text;
alter table spots add column if not exists station_walk_min smallint;
alter table spots add column if not exists facts_checked_on date;
alter table spots add column if not exists facts_sources jsonb;

alter table spots drop constraint if exists spots_custom_no_facts;
alter table spots add constraint spots_custom_no_facts check (
  source = 'curated' or (
    reopens_on is null and phone is null and website is null and licensed is null
    and dress_code is null and parking is null and reservations is null
    and halal_friendly is null and vegetarian_options is null and spend_pp_aed is null
    and good_to_know is null and nearest_station is null and station_line is null
    and station_walk_min is null and facts_checked_on is null and facts_sources is null
  )
);
alter table spots drop constraint if exists spots_website_http;
alter table spots add constraint spots_website_http check (website is null or website ~ '^https?://');

grant select (reopens_on, phone, website, licensed, dress_code, parking, reservations,
  halal_friendly, vegetarian_options, spend_pp_aed, good_to_know, nearest_station,
  station_line, station_walk_min, facts_checked_on, facts_sources)
  on spots to anon, authenticated;

-- ── Closures ─────────────────────────────────────────────────────────────────
${closures.join("\n")}

-- ── Corrections ──────────────────────────────────────────────────────────────
-- Cove Beach moved from Caesars Palace, Bluewaters to La Vie, JBR (2024).
update spots set area = 'La Vie, JBR' where id = '40000000-0000-0000-0000-000000000003' and source = 'curated';
-- Iris left The Oberoi (2019) and now runs as Iris Harbour at Dubai Harbour.
-- Category kept as 'shisha' although no source mentions shisha (flagged).
update spots set name = 'Iris Harbour', area = 'Dubai Harbour'
  where id = 'd0000000-0000-0000-0000-000000000004' and source = 'curated';

-- ── Facts ────────────────────────────────────────────────────────────────────
${updates.join("\n\n")}
`;

writeFileSync(OUT, sql);
console.log(JSON.stringify(counts));
for (const f of flagged) console.log("flag:", f);
