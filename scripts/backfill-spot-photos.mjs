// One-off data backfill, not a pipeline: sources photos for curated spots
// from free sources, downloads them into OUR OWN `spot-photos` bucket, and
// writes a reviewable local file. Nothing is written to the spots table by
// this script -- a separate migration does that, after hand review, the same
// way the coordinate backfill worked (037).
//
// ── Why our own bucket rather than the source's URL ──────────────────────
// Hotlinking third-party images rots (the URL changes or dies), can shift
// content under us, and some sources' terms forbid it outright. We download
// once, serve our own copy, and record where it came from.
//
// ── Why only a handful of spots ──────────────────────────────────────────
// Measured, not assumed (worklog 2026-09-06). Tier 1 (the venue's own site
// via the existing OG extraction) is limited by DATA, not machinery: only 2
// of 82 spots have any URL at all and one of those domains is dead. Tier 2
// (Wikipedia) yields ~9, all landmarks, because most venue names are common
// English words -- "Hummingbird" is the bird, "SoBe" a drink brand, "Saffron"
// the spice. The remaining ~72 need venue website URLs that nobody has
// collected yet. Stock imagery is deliberately NOT used: a stock photo
// asserts something false on the card at a glance, which is worse than an
// empty one.
//
// Every candidate here was hand-checked against the venue it claims to be
// before landing. Getting a photo wrong is worse than having none.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-spot-photos.mjs
// Writes scripts/spot-photos.local.json for review.

import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const UA = "plan-ind-dubai-hangout-app/1.0 (one-time curated-catalog photo backfill; contact via repo owner)";
const OUT_FILE = new URL("./spot-photos.local.json", import.meta.url);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hand-verified sources. Each Wikipedia title below was checked against the
// article's own text to confirm it describes THIS Dubai venue and not a
// same-named thing -- that check is why "Saffron" (the spice), "Hummingbird"
// (the bird), "SoBe" (a drink brand), "Bla Bla" (an animated film) and the
// Iris / Ninive / La mer disambiguation pages are absent despite matching by
// name. Wikipedia's search reproduced the exact single-token-name failure
// that overlapScore had; see worklog 2026-09-06.
const SOURCES = [
  { name: "Museum of the Future", source: "wikimedia", wikipedia: "Museum of the Future" },
  { name: "Mall of the Emirates", source: "wikimedia", wikipedia: "Mall of the Emirates" },
  { name: "The Green Planet", source: "wikimedia", wikipedia: "The Green Planet, Dubai" },
  { name: "Deep Dive Dubai", source: "wikimedia", wikipedia: "Deep Dive Dubai" },
  { name: "Cinema Akil", source: "wikimedia", wikipedia: "Cinema Akil" },
  { name: "Tresind Studio", source: "venue_site", website: "https://www.tresindstudio.com" },
];

// REJECTED AT VISUAL REVIEW -- kept here so nobody re-adds them thinking
// they were simply missed. Each of these fetched successfully, carried a
// valid free licence, and was still wrong. Licence-clean is not the bar;
// "is this actually this venue, and does it look like somewhere you'd go"
// is the bar.
//
//  - Black Tap: the image is the NEW YORK branch (NYC health-grade placard
//    in the window, Manhattan street). Right brand, wrong continent. This is
//    the most dangerous class of miss -- it looks completely correct.
//  - VOX Cinemas: real VOX signage but the WRONG BRANCH (our spot is Mall of
//    the Emirates; the photo is an outdoor plaza elsewhere), and it's a grey
//    overcast snapshot of empty paving. Same wrong-branch error the
//    coordinate backfill hit with McGettigan's.
//  - Dubai Safari Park: the "page image" is an SVG LOGO, not a photograph.
//    A brand mark on a place card is not the venue. (The download guard now
//    rejects SVG outright, so this one can no longer get this far.)
//  - Dubai Design District: fetch was rate-limited (HTTP 429) rather than
//    reviewed -- unjudged, not rejected. Worth retrying.

// Wikipedia's API rate-limits harder than its docs suggest, and a 429 is a
// "wait", not a failure -- so back off generously (up to ~2min total) rather
// than giving up on a venue we could have had. Callers treat a throw here as
// a per-entry failure, never a reason to abandon the run.
async function wikiApi(params) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${new URLSearchParams({ format: "json", ...params })}`, { headers: { "User-Agent": UA } });
    if (res.status === 429) { await sleep(8000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
    return res.json();
  }
  throw new Error("Wikipedia API rate limited after retries");
}

// The image URL alone is not enough: most Commons files are CC-BY or CC-BY-SA
// and REQUIRE credit on display. A photo whose licence we cannot read is
// skipped rather than guessed at -- an unattributed CC image is a licence
// breach, not an untidy card.
async function wikimediaPhoto(title) {
  const page = Object.values((await wikiApi({
    action: "query", titles: title, redirects: "1", prop: "pageimages", piprop: "original",
  }))?.query?.pages ?? {})[0];
  const imageUrl = page?.original?.source;
  if (!imageUrl) return { error: "no image on that page" };

  await sleep(1200);
  // The API appends utm_* query params to the image URL, so the last path
  // segment is "Name.jpeg?utm_source=..." -- strip the query before building
  // the File: title or every licence lookup silently misses.
  const fileName = decodeURIComponent(new URL(imageUrl).pathname.split("/").pop());
  const info = Object.values((await wikiApi({
    action: "query", titles: `File:${fileName}`, prop: "imageinfo", iiprop: "extmetadata|url",
  }))?.query?.pages ?? {})[0]?.imageinfo?.[0];
  const meta = info?.extmetadata;
  const licence = meta?.LicenseShortName?.value;
  if (!licence) return { error: "licence could not be read -- skipping rather than guessing" };

  // Files hosted on en.wikipedia rather than Commons are often local fair-use
  // uploads. Fair use is NOT a licence we can redistribute under, so reject
  // anything flagged non-free or whose licence doesn't read as free.
  if (meta?.NonFree?.value || /^(fair use|non-free)/i.test(licence)) {
    return { error: `non-free licence (${licence}) -- fair use is not redistributable` };
  }

  const stripTags = (html) => (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const artist = stripTags(meta?.Artist?.value) || "Unknown author";
  return {
    imageUrl,
    licence,
    // This string is what must appear next to the photo wherever it renders.
    attribution: `${artist} / Wikimedia Commons / ${licence}`.slice(0, 300),
    descriptionUrl: info?.descriptionurl ?? null,
  };
}

async function venueSitePhoto(website) {
  const res = await fetch(website, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) return { error: `site returned ${res.status}` };
  const html = (await res.text()).slice(0, 512 * 1024);
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!match) return { error: "no og:image on the venue's own site" };
  // A venue's own image used to represent that venue needs no third-party
  // credit, which is why photo_source 'venue_site' is exempt from the
  // attribution constraint in migration 038.
  return { imageUrl: new URL(match[1], website).toString(), licence: "venue's own image", attribution: null };
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return { error: `image fetch ${res.status}` };
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  // `image/*` is too loose on Wikipedia: several venues' "page image" is an
  // SVG LOGO, not a photograph -- Dubai Safari Park's was its brand mark. A
  // logo on a place card is not the venue, and SVG additionally carries
  // scripting, which has no business in a public bucket we serve raw.
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED.includes(contentType)) return { error: `not a usable photo (${contentType})` };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { error: `image too large (${(bytes.byteLength / 1e6).toFixed(1)}MB)` };
  return { bytes, contentType };
}

const admin = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });
const { data: spots, error: spotsError } = await admin
  .from("spots").select("id, name, category").eq("source", "curated");
if (spotsError) throw new Error(`Reading spots failed: ${spotsError.message}`);
const byName = new Map(spots.map((s) => [s.name, s]));

const results = [];
for (const entry of SOURCES) {
  const spot = byName.get(entry.name);
  if (!spot) { results.push({ ...entry, status: "no_such_spot" }); continue; }

  // One venue's bad day must not cost the ones already fetched: a backfill
  // that aborts halfway throws away work and has to be re-run against an
  // API that just rate-limited it.
  let found;
  try {
    found = entry.source === "wikimedia"
      ? await wikimediaPhoto(entry.wikipedia)
      : await venueSitePhoto(entry.website);
  } catch (error) {
    found = { error: error instanceof Error ? error.message : String(error) };
  }
  if (found.error) { results.push({ ...entry, id: spot.id, status: "failed", detail: found.error }); await sleep(1200); continue; }

  const file = await download(found.imageUrl);
  if (file.error) { results.push({ ...entry, id: spot.id, status: "failed", detail: file.error }); await sleep(1200); continue; }

  const ext = file.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const path = `${spot.id}.${ext}`;
  const { error: uploadError } = await admin.storage.from("spot-photos")
    .upload(path, file.bytes, { contentType: file.contentType, upsert: true });
  if (uploadError) { results.push({ ...entry, id: spot.id, status: "failed", detail: uploadError.message }); await sleep(1200); continue; }

  results.push({
    id: spot.id, name: spot.name, category: spot.category,
    status: "ok", photo_source: entry.source,
    storagePath: path,
    publicUrl: admin.storage.from("spot-photos").getPublicUrl(path).data.publicUrl,
    photo_attribution: found.attribution,
    licence: found.licence,
    sourceUrl: found.imageUrl,
    descriptionUrl: found.descriptionUrl ?? entry.website ?? null,
    bytes: file.bytes.byteLength,
  });
  console.log(`  ok  ${spot.name}  (${found.licence})`);
  await sleep(1200);
}

const ok = results.filter((r) => r.status === "ok");
console.log(`\n${ok.length}/${SOURCES.length} sourced and uploaded.`);
for (const r of results.filter((r) => r.status !== "ok")) console.log(`  ${r.status}: ${r.name} -- ${r.detail ?? ""}`);
console.log("\nEvery one of these still needs a human to open the URL and confirm it shows the right venue.");
console.log("A wrong photo is worse than none -- it asserts something false on the card.");

await writeFile(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nWrote ${OUT_FILE.pathname}. Nothing written to the spots table; a reviewed migration does that.`);
