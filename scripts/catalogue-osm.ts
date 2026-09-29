// Grows the curated catalogue from OpenStreetMap (migration 089).
//
//   node --experimental-strip-types --import ./tests/register-aliases.mjs scripts/catalogue-osm.ts
//
// 1. One Overpass query (Dubai + the Hatta enclave) for the tags
//    lib/catalogue/osm.ts maps to our categories.
// 2. The rules there: chains (brand tags), unnamed, unmappable, outside our
//    districts, already in the catalogue, duplicates -> skipped, with reasons.
// 3. A vibe line for each candidate, best first: OSM's description=, else
//    the venue's own site (meta description). Neither -> skipped.
// 4. selectSpread picks ~120 across categories and districts.
// Writes data/catalogue-089.json (the reviewed rows: OSM and venue-site facts
// only), scripts/catalogue-089.local.csv (the review file, a source per field)
// and supabase/migration-089-catalogue-growth.sql. Google has no part in it.
// Overpass and venue sites are asked politely: one query, then at most 4
// sites at a time with a real User-Agent and an 8 s timeout.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidatesFrom, selectSpread, type CatalogueRow, type OsmElement } from "../lib/catalogue/osm.ts";
import { catalogueSql, type CatalogueRecord } from "../lib/catalogue/sql.ts";

const root = path.resolve(import.meta.dirname, "..");
const TOTAL = 120;
const USER_AGENT = "plan-ind catalogue builder (https://plan-ind.vercel.app; contact via the site)";
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

/** The venue's own words, cleaned: one line, 20-120 chars, cut at a word. */
export function cleanVibe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, "\"").replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
  if (text.length < 30 || /https?:|www\.|cookie|javascript|©|\{|\}/i.test(text)) return null;
  // A review, a sales line or a notice is not a vibe.
  if (/\b(rating|ratings|review|overpriced|stars?|only for|guests only|members only|book (now|online|a court)|order (now|online)|buy|marketplace|nft|franchise|brand|official (site|website)|welcome to|log ?in|sign ?up|download|app store|coming soon|under construction|deals?|offer|discount|%)\b/i.test(text)) return null;
  if ((text.match(/[a-z]/gi)?.length ?? 0) < text.length * 0.6) return null; // mostly not English letters
  if (text.length <= 120) return text.replace(/[\s.,;:!-]+$/, "");
  const cut = text.slice(0, 120);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s.,;:!-]+$/, "");
}

async function siteDescription(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 200_000);
    const meta = /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i.exec(html)
      ?? /<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i.exec(html);
    return cleanVibe(meta?.[1]);
  } catch {
    return null;
  }
}

async function main() {
  const facts = JSON.parse(await readFile(path.join(root, "data/venue-facts.json"), "utf8")) as { venues?: { name?: string }[] };
  const seed = await readFile(path.join(root, "supabase/seed.sql"), "utf8");
  const existing = [...(facts.venues ?? []).map((v) => v.name ?? ""), ...[...seed.matchAll(/\('[0-9a-f-]{36}',\s*'([^']+)'/g)].map((m) => m[1])];

  const elements = await overpass();
  const tagsOf = new Map(elements.map((el) => [`${el.type}/${el.id}`, el.tags ?? {}]));
  const { kept, skipped } = candidatesFrom(elements, existing);
  // Best first, spread, over everything kept: the order vibes are fetched in.
  const ordered = selectSpread(kept, kept.length, Number.POSITIVE_INFINITY);

  const accepted: (CatalogueRow & { vibe: string; vibeSource: string })[] = [];
  const queue = [...ordered];
  const perCategory = new Map<string, number>();
  async function worker() {
    for (let row = queue.shift(); row; row = queue.shift()) {
      if ((perCategory.get(row.category) ?? 0) >= 16) { skipped.push({ ref: row.osmRef, name: row.name, reason: "category already has enough" }); continue; }
      const osmDescription = cleanVibe(tagsOf.get(row.osmRef)?.description);
      const site = osmDescription || !row.website ? null : await siteDescription(row.website);
      const vibe = osmDescription ?? site;
      if (!vibe) { skipped.push({ ref: row.osmRef, name: row.name, reason: row.website ? "no description on its site" : "no website or description" }); continue; }
      accepted.push({ ...row, vibe, vibeSource: osmDescription ? "osm:description" : row.website! });
      perCategory.set(row.category, (perCategory.get(row.category) ?? 0) + 1);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const picks = selectSpread(accepted, TOTAL);
  const rows: CatalogueRecord[] = picks.map((row, i) => {
    const full = accepted.find((a) => a.osmRef === row.osmRef)!;
    return {
      id: `c0890000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`, osmRef: row.osmRef, name: row.name, category: row.category,
      area: row.area, cuisine: row.cuisine, latitude: row.latitude, longitude: row.longitude, openTill: row.openTill,
      website: row.website, minimumAge: row.minimumAge, vibe: full.vibe, vibeSource: full.vibeSource,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(root, "data/catalogue-089.json"), `${JSON.stringify({ generated: today, source: "OpenStreetMap (ODbL) and each venue's own website", rows }, null, 1)}\n`);
  const csv = [
    "id,name,name_source,category,category_source,area,area_source,cuisine,cuisine_source,lat,lon,coords_source,open_till,open_till_source,vibe,vibe_source,min_age",
    ...rows.map((r) => [r.id, r.name, `osm ${r.osmRef}`, r.category, "osm tags -> lib/catalogue/osm.ts", r.area, "nearest district area to the OSM point",
      r.cuisine, "osm cuisine/sport tag, else our label", r.latitude, r.longitude, `osm ${r.osmRef}`, r.openTill, r.openTill ? "osm opening_hours" : "unknown",
      r.vibe, r.vibeSource, r.minimumAge].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  await writeFile(path.join(root, "scripts/catalogue-089.local.csv"), `${csv}\n`);
  await writeFile(path.join(root, "scripts/catalogue-089-skipped.local.json"), `${JSON.stringify(skipped, null, 1)}\n`);
  console.log(`elements ${elements.length}, candidates ${kept.length}, with a vibe ${accepted.length}, picked ${rows.length}`);
  const reasons = new Map<string, number>();
  for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  console.log("skipped:", Object.fromEntries(reasons));
  void catalogueSql; // the migration is written by the generator step (--sql)
}

const HEADER = `-- Migration 089: catalogue growth from OpenStreetMap.
--
-- STAGED -- generated, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
-- Generated by scripts/catalogue-osm.ts --sql from data/catalogue-089.json;
-- never hand-edit: change the data or the rules (lib/catalogue/osm.ts) and re-run.
--
-- Every stored fact is from OpenStreetMap (ODbL, credited on /credits) or the
-- venue's own website, or authored by us (category, area, the cuisine label
-- when OSM has none, minimum age from our category policy). Nothing from
-- Google: google_place_id stays null (the matcher attaches it later), no
-- names, ratings, prices or photos from Google. Unknown stays unknown:
-- price_band null (this migration makes it nullable: no made-up bands),
-- min_spend 0 and open_till '' (the app's existing "unknown" conventions).
-- facts_sources records each row's sources. Idempotent: fixed ids in the
-- c0890000- range, on conflict do nothing.

begin;

alter table spots alter column price_band drop not null;

`;

if (process.argv.includes("--sql")) {
  const data = JSON.parse(await readFile(path.join(root, "data/catalogue-089.json"), "utf8")) as { generated: string; rows: CatalogueRecord[] };
  await writeFile(path.join(root, "supabase/migration-089-catalogue-growth.sql"), `${HEADER}${catalogueSql(data.rows, data.generated)}\ncommit;\n`);
  console.log(`wrote 089 with ${data.rows.length} rows`);
} else {
  await main();
}
