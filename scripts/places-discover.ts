// Places DISCOVERY, dry run: candidate venues from a category x area grid of
// Text Search (New) requests, written to a local review file. Writes to NO
// database, ever. Without --go it prints the plan and the cost and calls
// nothing, so seeing the price is free.
//
//   npm run places:discover                         # plan + cost only, no network
//   npm run places:discover -- --go                 # calls Google (owner's spend decision)
//   npm run places:discover -- --go --categories padel,escape --areas "Al Quoz,JLT"
//
// Output (gitignored, Google content we may not keep: delete after review):
//   scripts/places-discovery.local.json and scripts/places-discovery.local.csv
//
// Flags: --categories a,b   --areas "A,B"   --pages <1-3> (default 1)
//        --max-requests <n> (default 900, under the 1,000/month free tier)
//        --delay-ms <n> (default 300)   --out <path without extension>
//        --base-url <url> (loopback fixture server only)   --known <spots.json>
//
// Stops after 3 failed requests in a row. The key is read from
// GOOGLE_PLACES_API_KEY, sent only in the X-Goog-Api-Key header, never printed.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { placesFetchJson, PLACES_API_BASE, redactKey } from "../lib/places/client.ts";
import {
  buildDiscoveryRequest, candidatesCsv, dedupeCandidates, DEFAULT_MAX_REQUESTS, discoveryCost, discoveryGrid,
  parseDiscoveryPage, type Candidate,
} from "../lib/places/discovery.ts";

const root = path.resolve(import.meta.dirname, "..");
const { values: args } = parseArgs({
  options: {
    go: { type: "boolean", default: false },
    categories: { type: "string", default: "" },
    areas: { type: "string", default: "" },
    pages: { type: "string", default: "1" },
    "max-requests": { type: "string", default: String(DEFAULT_MAX_REQUESTS) },
    "delay-ms": { type: "string", default: "300" },
    out: { type: "string", default: path.join(root, "scripts/places-discovery.local") },
    "base-url": { type: "string" },
    known: { type: "string" },
  },
});

function block(reason: string): never {
  console.error(`BLOCK: ${reason}`);
  process.exit(1);
}
const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

/** Place ids already in the catalogue (a --known file, else the live catalogue read anonymously), so the review can skip them. */
async function knownPlaceIds(): Promise<Set<string>> {
  if (args.known) {
    const rows = JSON.parse(await readFile(args.known, "utf8")) as { google_place_id?: string | null }[];
    return new Set(rows.map((row) => row.google_place_id).filter((id): id is string => Boolean(id)));
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return new Set(); // not fatal: every candidate just shows known=false
  const { createClient } = await import("@supabase/supabase-js");
  const { data, error } = await createClient(url, anonKey, { auth: { persistSession: false } })
    .from("spots").select("google_place_id").eq("source", "curated").not("google_place_id", "is", null);
  if (error) block(`reading known place ids failed: ${error.message}`);
  return new Set((data ?? []).map((row) => row.google_place_id as string));
}

let grid;
try {
  grid = discoveryGrid(list(args.categories), list(args.areas));
} catch (error) {
  block(error instanceof Error ? error.message : String(error));
}
const pages = Math.min(3, Math.max(1, Number(args.pages) || 1));
const maxRequests = Math.max(1, Number(args["max-requests"]) || DEFAULT_MAX_REQUESTS);
const cost = discoveryCost(grid.length, pages, maxRequests);
console.log(`${grid.length} grid cells x up to ${pages} page(s) -> at most ${cost.requests} Text Search Enterprise requests (cap ${maxRequests}), up to ${cost.maxCandidates} results before dedupe.`);
console.log(`Cost: $${cost.usdIfFreeTierUnused.toFixed(2)} if this month's 1,000 free requests are unused; $${cost.usdIfFreeTierSpent.toFixed(2)} if they are already spent.`);
if (!args.go) {
  console.log("Plan only: nothing was called. Re-run with --go to spend it.");
  process.exit(0);
}

const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
if (!apiKey) block("GOOGLE_PLACES_API_KEY is not set (server-only, never NEXT_PUBLIC_). Put it in .env.local and re-run.");
const baseUrl = args["base-url"] ?? PLACES_API_BASE;
const delayMs = Math.max(0, Number(args["delay-ms"]) || 0);
const known = await knownPlaceIds();

const found: Omit<Candidate, "known">[] = [];
let requests = 0;
let failuresInARow = 0;
outer: for (const cell of grid) {
  let pageToken: string | undefined;
  for (let page = 0; page < pages; page++) {
    if (requests >= maxRequests) { console.log(`Stopped at the ${maxRequests}-request cap.`); break outer; }
    if (requests > 0 && delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    requests++;
    try {
      const result = parseDiscoveryPage(await placesFetchJson(buildDiscoveryRequest(cell, apiKey, baseUrl, pageToken), apiKey), cell);
      failuresInARow = 0;
      found.push(...result.candidates);
      console.log(`${cell.category} · ${cell.area.name} · page ${page + 1}: ${result.candidates.length}`);
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    } catch (error) {
      console.log(redactKey(`${cell.category} · ${cell.area.name}: ${error instanceof Error ? error.message : String(error)}`, apiKey));
      if (++failuresInARow >= 3) block("3 requests failed in a row; stopping (see above). Nothing was written.");
      break;
    }
  }
}

const candidates = dedupeCandidates(found, known);
const generatedAt = new Date().toISOString();
await writeFile(`${args.out}.json`, JSON.stringify({ generatedAt, requests, note: "Google Places content: review, then delete. Never commit or store it.", candidates }, null, 2));
await writeFile(`${args.out}.csv`, candidatesCsv(candidates));
const fresh = candidates.filter((c) => !c.known).length;
console.log(`\n${requests} requests · ${found.length} results · ${candidates.length} unique · ${fresh} not in the catalogue.`);
console.log(`Wrote ${path.relative(root, args.out)}.json and .csv. Nothing was written to any database.`);
