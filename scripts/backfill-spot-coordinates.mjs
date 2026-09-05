// One-off data backfill, not a pipeline: geocodes the curated catalog's
// missing latitude/longitude via Nominatim (OpenStreetMap's free geocoder --
// no API key, no paid Places API, matching the owner's standing "skip paid
// APIs" call). Confirmed live: all 82 curated spots have null lat/long, so
// the "getting there" feature (haversine distance + Maps link, already
// shipped) can never actually render for a real user today. This script
// only READS the live catalog and WRITES a local review file -- it never
// touches the database. A separate, explicit apply step (with the owner's
// sign-off) does the actual UPDATE, same as every other live-DB change in
// this project.
//
// Nominatim usage policy, followed here: max 1 request/second, a real
// descriptive User-Agent identifying the app (a generic/absent one gets
// blocked), no parallel hammering. This is a slow, sequential, 82-request
// run by design -- do not "optimize" it into concurrent requests.
//
// Usage:
//   node scripts/backfill-spot-coordinates.mjs
// Writes scripts/spot-coordinates.local.json for review. Nothing is
// written to Supabase by this script.

import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "plan-ind-dubai-hangout-app/1.0 (one-time curated-catalog geocoding backfill)";
const RATE_LIMIT_MS = 1100; // just over Nominatim's 1 req/sec policy floor
const OUT_FILE = new URL("./spot-coordinates.local.json", import.meta.url);

// Dubai's real bounding box, generously padded (Hatta and the desert spots
// sit well outside the city core). A result outside this is almost
// certainly a geocoding miss, not a real Dubai coordinate.
const DUBAI_BOUNDS = { minLat: 24.6, maxLat: 25.6, minLng: 54.8, maxLng: 56.5 };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -- run with --env-file=.env.local");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCuratedSpots() {
  // "read permitted spots" is granted `to authenticated`, not `anon` -- a
  // bare anon-key read returns zero rows. One throwaway anonymous session
  // (the real guest path, already live) is enough to read the public
  // curated catalog; this script writes nothing anywhere with it.
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error: authError } = await client.auth.signInAnonymously();
  if (authError) throw new Error(`Anonymous sign-in failed: ${authError.message}`);
  const { data, error } = await client.from("spots").select("id, name, area, category").eq("source", "curated").order("category").order("name");
  if (error) throw new Error(`Reading curated spots failed: ${error.message}`);
  return data;
}

async function nominatimSearch(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return { httpError: `${res.status}` };
  const [top] = await res.json();
  return { top };
}

// The full "name, area, Dubai, UAE" query only matched 27/82 -- OSM's own
// tagging doesn't always include the neighborhood the way this catalog
// names it. One looser fallback query (name + city only) when the strict
// one misses, same rate-limit courtesy applied to the retry.
async function geocode(spot) {
  let { top, httpError } = await nominatimSearch(`${spot.name}, ${spot.area}, Dubai, United Arab Emirates`);
  let usedFallback = false;
  if (!top && !httpError) {
    await sleep(RATE_LIMIT_MS);
    ({ top, httpError } = await nominatimSearch(`${spot.name}, Dubai, United Arab Emirates`));
    usedFallback = true;
  }
  if (httpError) return { ...spot, status: "http_error", detail: httpError };
  if (!top) return { ...spot, status: "no_match" };

  const lat = Number(top.lat);
  const lng = Number(top.lon);
  const inBounds = lat >= DUBAI_BOUNDS.minLat && lat <= DUBAI_BOUNDS.maxLat && lng >= DUBAI_BOUNDS.minLng && lng <= DUBAI_BOUNDS.maxLng;
  return {
    ...spot,
    status: inBounds ? "ok" : "out_of_bounds",
    usedFallbackQuery: usedFallback,
    latitude: lat,
    longitude: lng,
    matchedName: top.display_name,
  };
}

const spots = await fetchCuratedSpots();
console.log(`Geocoding ${spots.length} curated spots via Nominatim, ~1/sec (this takes a while by design)...`);

const results = [];
for (const [i, spot] of spots.entries()) {
  const result = await geocode(spot);
  results.push(result);
  process.stdout.write(`\r  ${i + 1}/${spots.length}`);
  if (i < spots.length - 1) await sleep(RATE_LIMIT_MS);
}
console.log();

const ok = results.filter((r) => r.status === "ok");
const okFallback = ok.filter((r) => r.usedFallbackQuery);
const needsReview = results.filter((r) => r.status !== "ok");

console.log(`\n${ok.length}/${results.length} geocoded within Dubai's bounding box (${okFallback.length} via the looser name-only fallback query -- these lost the area as a disambiguator, spot-check them extra carefully before applying).`);
if (needsReview.length) {
  console.log(`${needsReview.length} need manual review (no match / out of bounds / http error):`);
  for (const r of needsReview) console.log(`  ${r.status.padEnd(14)} ${r.name} (${r.area})`);
}
if (okFallback.length) {
  console.log(`\nFallback-query matches (verify these against the area/name manually):`);
  for (const r of okFallback) console.log(`  ${r.name} (${r.area}): ${r.latitude}, ${r.longitude} -- "${r.matchedName}"`);
}

console.log("\nSample of 5 successful matches, spot-check these look like real Dubai places before trusting the rest:");
for (const r of ok.slice(0, 5)) {
  console.log(`  ${r.name}: ${r.latitude}, ${r.longitude} -- matched "${r.matchedName}"`);
}

await writeFile(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nWrote ${results.length} results to ${OUT_FILE.pathname} for review.`);
console.log("Nothing has been written to Supabase. Review the file, then a separate explicit step applies it.");
