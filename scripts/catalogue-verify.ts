// For the 089 reviewer: does each venue's own website say it is that venue?
// Read-only and slow on purpose: one site at a time, a second apart.
//
//   node --experimental-strip-types --import ./tests/register-aliases.mjs scripts/catalogue-verify.ts <id> [<id> ...]
//   ... scripts/catalogue-verify.ts --pending      (every row not yet approved or rejected)
//   ... --file data/catalogue-090-part2.json ...   (another review file; default 089's)
//
// Prints, per row: whether the name appears in the site's title or
// description, the title, the description, and where the site ended up.
// Changes nothing; the reviewer edits the review file.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewRow } from "../lib/catalogue/review.ts";
import { siteMeta } from "./catalogue-web.ts";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const fileAt = args.indexOf("--file");
const file = fileAt >= 0 ? args[fileAt + 1] : "data/catalogue-089.json";
const rows = (JSON.parse(await readFile(path.resolve(root, file), "utf8")) as { rows: ReviewRow[] }).rows;
const chosen = args.includes("--pending")
  ? rows.filter((r) => !r.approved && !r.reject_reason)
  : rows.filter((r) => args.includes(r.id));
if (chosen.length === 0) {
  console.log("usage: [--file data/<review>.json] <id> [<id> ...] | --pending");
  process.exit(1);
}

const words = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);
/** Most of the name's own words appear in what the site says about itself. */
export function nameMatches(name: string, text: string): boolean {
  const own = words(name).filter((w) => !["the", "and", "dubai", "restaurant", "cafe", "bar", "lounge"].includes(w));
  if (own.length === 0) return false;
  const hay = new Set(words(text));
  return own.filter((w) => hay.has(w)).length / own.length >= 0.5;
}

for (const [i, row] of chosen.entries()) {
  if (i > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!row.website) {
    console.log(`\n${row.id}  ${row.name}  [${row.category}, ${row.area}]\n  no website on the OSM object: ${row.osm_url}`);
    continue;
  }
  const meta = await siteMeta(row.website);
  const match = meta ? nameMatches(row.name, `${meta.title ?? ""} ${meta.description ?? ""}`) : false;
  console.log(`\n${row.id}  ${row.name}  [${row.category}, ${row.area}]  ${meta ? (match ? "NAME ON SITE" : "name NOT on site") : "site unreachable"}`);
  if (meta) {
    console.log(`  title: ${meta.title ?? "(none)"}`);
    console.log(`  about: ${meta.description ?? "(none usable)"}`);
    if (meta.finalUrl !== row.website) console.log(`  ended at: ${meta.finalUrl}`);
  }
  console.log(`  osm: ${row.osm_url}`);
}
