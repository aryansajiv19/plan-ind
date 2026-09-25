// Places backfill: curated spot -> Google place id (+ the venue's own photo).
// Dry-run by default. Writes to NO database, ever.
//
//   npm run places:backfill                      # search: calls Google, writes the review file
//   npm run places:backfill -- --write-sql       # offline: review file -> staged migrations
//
// Search mode, per curated spot, sequentially: one Text Search (New) with the
// reviewed field mask (lib/places/client.ts), a name + distance confidence
// check (lib/places/match.ts), and -- for a match with a website and no photo
// yet -- the venue's own og:image through the SSRF-hardened fetch, saved to
// scripts/places-photos.local/ for the owner to upload. Output:
// scripts/places-review.local.json (gitignored), where the owner flips
// `approve` per entry. Cost: one Text Search Enterprise request per spot --
// 82 spots = 82 requests, inside the 1,000/month free tier ($0), $2.87 if
// that allowance is already spent. The estimate is printed before any call.
//
// --write-sql mode makes NO network call and needs no key: it reads the
// reviewed file and writes the next free numbered migration(s) under
// supabase/, STAGED -- applying them is the owner's decision.
//
// Flags: --spots <file.json>   use a spot list instead of reading the live catalogue
//        --only <spot-id>      one spot (try this first)   --limit <n>
//        --no-photos           skip the og:image step      --delay-ms <n> (default 300)
//        --review <file>       review file path            --storage-url <url> (write-sql)
//        --base-url <url>      Places API origin (loopback fixture server only)
//
// The key is read from GOOGLE_PLACES_API_KEY, sent only in the X-Goog-Api-Key
// header, and never printed.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  buildTextSearchRequest,
  parseTextSearch,
  placesFetchJson,
  PLACES_API_BASE,
  redactKey,
  TEXT_SEARCH_FIELD_MASK,
} from "../lib/places/client.ts";
import { estimateCost, planFromReview, runBackfill, type BackfillSpot, type ReviewFile } from "../lib/places/backfill.ts";
import { nextMigrationNumber, photoMigration, placeIdMigration, storageBase } from "../lib/places/sql.ts";

const root = path.resolve(import.meta.dirname, "..");
const { values: args } = parseArgs({
  options: {
    "write-sql": { type: "boolean", default: false },
    spots: { type: "string" },
    only: { type: "string" },
    limit: { type: "string" },
    "no-photos": { type: "boolean", default: false },
    "delay-ms": { type: "string", default: "300" },
    review: { type: "string", default: path.join(root, "scripts/places-review.local.json") },
    "photos-dir": { type: "string", default: path.join(root, "scripts/places-photos.local") },
    "migrations-dir": { type: "string", default: path.join(root, "supabase") },
    "storage-url": { type: "string" },
    "base-url": { type: "string" },
  },
});

function block(reason: string): never {
  console.error(`BLOCK: ${reason}`);
  process.exit(1);
}

async function loadSpots(): Promise<BackfillSpot[]> {
  if (args.spots) {
    const rows = JSON.parse(await readFile(args.spots, "utf8")) as BackfillSpot[];
    if (!Array.isArray(rows)) block(`${args.spots} is not a JSON array of spots`);
    return rows;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) block("no --spots file and no NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY to read the live catalogue");
  // Read-only and sessionless: the anon role reads curated spots directly
  // (policy "read curated spots anonymously", migration 041). No sign-in --
  // anonymous sessions are refused everywhere since migration 064, and this
  // read never needed one. Nothing is written.
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.from("spots")
    .select("id, name, area, category, latitude, longitude, photo_url")
    .eq("source", "curated").order("category").order("name");
  if (error) block(`reading curated spots failed: ${error.message}`);
  // Zero rows with no error is what a missing anon policy looks like.
  if (!data?.length) block("read 0 curated spots without a session -- is migration 041's anon policy applied?");
  return data as BackfillSpot[];
}

async function search(): Promise<void> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) {
    block("GOOGLE_PLACES_API_KEY is not set. Put it in .env.local (server-only, never NEXT_PUBLIC_) "
      + "or export it, then re-run. --write-sql needs no key.");
  }
  const baseUrl = args["base-url"] ?? process.env.PLACES_API_BASE_URL ?? PLACES_API_BASE;
  const delayMs = Math.max(0, Number(args["delay-ms"]) || 0);

  let spots = await loadSpots();
  if (args.only) spots = spots.filter((spot) => spot.id === args.only);
  if (args.limit) spots = spots.slice(0, Math.max(0, Number(args.limit) || 0));
  if (spots.length === 0) block("no spots selected");

  const estimate = estimateCost(spots.length);
  console.log(`${spots.length} spots -> ${estimate.requests} Text Search requests. ${estimate.note}`);
  console.log(`Estimated cost: $0 inside the free tier; $${estimate.worstCaseUsd.toFixed(2)} if it is already spent.`);

  const photosDir = args["photos-dir"];
  if (!args["no-photos"]) await mkdir(photosDir, { recursive: true });
  // Loaded lazily: these are server-only modules, resolved through the
  // alias loader the npm script passes (tests/register-aliases.mjs).
  const { fetchWebClues } = await import("../lib/place-import/web-adapter.ts");
  const { safeFetchImage } = await import("../lib/place-import/safe-fetch.ts");

  const review = await runBackfill(spots, {
    searchText: async (spot) => {
      try {
        return parseTextSearch(await placesFetchJson(buildTextSearchRequest(spot, apiKey, baseUrl), apiKey));
      } catch (error) {
        throw new Error(redactKey(error instanceof Error ? error.message : String(error), apiKey));
      }
    },
    fetchOgImage: async (pageUrl) => (await fetchWebClues(pageUrl)).thumbnailUrl,
    downloadImage: (url) => safeFetchImage(url),
    saveFile: (name, bytes) => writeFile(path.join(photosDir, name), bytes),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    log: (line) => console.log(redactKey(line, apiKey)),
  }, { delayMs, photos: !args["no-photos"], fieldMask: TEXT_SEARCH_FIELD_MASK });

  await writeFile(args.review, JSON.stringify(review, null, 2));
  const count = (c: string) => review.entries.filter((entry) => entry.confidence === c).length;
  const saved = review.entries.filter((entry) => entry.photo.status === "saved").length;
  console.log(`\nhigh ${count("high")} · review ${count("review")} · reject ${count("reject")} · error ${count("error")} · photos saved ${saved}`);
  console.log(`Wrote ${path.relative(root, args.review)}. Nothing was written to any database.`);
  console.log("Next: open every photo and every 'review' entry, set approve true/false, then run with --write-sql.");
  const errors = count("error");
  console.log(errors ? `BLOCK: ${errors} searches failed -- see the review file` : "ok");
  if (errors) process.exitCode = 1;
}

async function writeSql(): Promise<void> {
  let review: ReviewFile;
  try {
    review = JSON.parse(await readFile(args.review, "utf8")) as ReviewFile;
  } catch {
    block(`could not read ${args.review} -- run the search step first`);
  }
  const plan = planFromReview(review);
  if (plan.placeIds.length === 0) block("no approved entries in the review file");

  const dir = args["migrations-dir"];
  const number = nextMigrationNumber(await readdir(dir));
  const idsFile = path.join(dir, `migration-${String(number).padStart(3, "0")}-places-backfill-ids.sql`);
  try {
    await writeFile(idsFile, placeIdMigration(number, plan.placeIds, review.generatedAt), { flag: "wx" });
  } catch (error) {
    block(error instanceof Error ? error.message : String(error));
  }
  console.log(`ok  wrote ${path.relative(root, idsFile)} (${plan.placeIds.length} place ids) -- STAGED`);

  if (plan.photos.length > 0) {
    const supabaseUrl = args["storage-url"] ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) block("approved photos need --storage-url (the live project URL) to build their public URLs");
    const photosFile = path.join(dir, `migration-${String(number + 1).padStart(3, "0")}-places-backfill-photos.sql`);
    await writeFile(photosFile, photoMigration(number + 1, plan.photos, storageBase(supabaseUrl), review.generatedAt), { flag: "wx" });
    const manifest = plan.photos.map((photo) => ({ file: photo.file, spot: photo.spotName, spotId: photo.spotId, source: "venue_site", from: photo.sourcePage }));
    await writeFile(path.join(args["photos-dir"], "UPLOAD.json"), JSON.stringify(manifest, null, 2));
    console.log(`ok  wrote ${path.relative(root, photosFile)} (${plan.photos.length} photos) -- STAGED, upload the files in UPLOAD.json first`);
  }
}

await (args["write-sql"] ? writeSql() : search());
