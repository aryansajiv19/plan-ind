// Mints N real anonymous Supabase sessions against the live project — the
// exact same path a real guest takes (signInAnonymously -> claim_plan_access)
// -- and writes their {access_token, participant_token_hash} pairs to a local
// JSON file for concurrency.mjs to drive load with. No service-role key, no
// permanent account: this only exercises what's already self-serve and live.
//
// Usage:
//   node --env-file=.env.local scripts/load/mint-voters.mjs [count]
//
// ponytail: one file, reuses the already-installed @supabase/supabase-js
// rather than hand-rolling the GoTrue REST calls.

import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const PLAN_ID = "33333333-3333-3333-3333-333333333333";
const OUT_FILE = new URL("./voters.local.json", import.meta.url);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  console.error("Run with: node --env-file=.env.local scripts/load/mint-voters.mjs [count]");
  process.exit(1);
}

const count = Number(process.argv[2] ?? 50);

async function mintOne(i) {
  // Fresh client per voter -- each needs its own independent auth session,
  // not a shared/overwriting one.
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.session) throw new Error(`voter ${i}: signInAnonymously failed: ${error?.message}`);

  const { error: claimError } = await client.rpc("claim_plan_access", { p_plan_id: PLAN_ID });
  if (claimError) throw new Error(`voter ${i}: claim_plan_access failed: ${claimError.message}`);

  const participantTokenHash = createHash("sha256").update(`load-test-${randomUUID()}`).digest("hex");
  return { access_token: data.session.access_token, participant_token_hash: participantTokenHash };
}

// GoTrue rate-limits anonymous signInAnonymously bursts hard (an hour-scale
// per-IP bucket, ~30 total observed in testing -- retrying sooner does not
// help). Minting isn't the thing under measurement, so stagger it AND
// tolerate individual failures -- append an existing voters.local.json
// (dev-machine IP is a shared, slowly-replenishing bucket across runs) and
// report a rate-limit hit as a finding, not a crash.
const BATCH = 5;
const DELAY_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const existing = await readFile(OUT_FILE, "utf8").then((raw) => JSON.parse(raw)).catch(() => []);
console.log(`Minting up to ${count} anonymous voter sessions against ${url} for plan ${PLAN_ID}...`);
if (existing.length) console.log(`(${existing.length} already minted from a previous run, reusing + appending)`);

const voters = [...existing];
let rateLimited = false;
for (let i = 0; voters.length < existing.length + count && i < count && !rateLimited; i += BATCH) {
  const batchSize = Math.min(BATCH, existing.length + count - voters.length);
  const results = await Promise.allSettled(Array.from({ length: batchSize }, (_, j) => mintOne(i + j)));
  for (const r of results) {
    if (r.status === "fulfilled") voters.push(r.value);
    else if (String(r.reason).includes("rate limit")) rateLimited = true;
    else console.error(`  ${r.reason}`);
  }
  process.stdout.write(`\r  ${voters.length - existing.length}/${count} newly minted`);
  if (!rateLimited && voters.length < existing.length + count) await sleep(DELAY_MS);
}
console.log();
if (rateLimited) {
  console.log(`Hit GoTrue's anonymous-signup rate limit -- stopped early with ${voters.length} total voters.`);
  console.log("This is itself a finding: a burst of real guests opening a share link from the same IP");
  console.log("(shared wifi) within the window can be throttled the same way. Not fixed here -- see report.");
}
await writeFile(OUT_FILE, JSON.stringify(voters, null, 2));
console.log(`Wrote ${voters.length} voters to ${OUT_FILE.pathname}`);
