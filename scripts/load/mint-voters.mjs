// Mints N PERMANENT test accounts on a LOCAL Supabase stack, each taken
// through the real participant path -- password sign-in, then
// claim_plan_access under its own session -- and writes their
// {access_token, participant_token_hash} pairs to a local JSON file for
// concurrency.mjs to drive load with.
//
// Why local, and why permanent: since the owner decision of 2026-09-25 a plan
// needs a permanent account (migration 064 refuses anonymous sessions in every
// participant RPC), so the anonymous sessions this used to mint on the live
// project can no longer vote. Minting permanent accounts needs an admin key,
// and the only one this project has is the Supabase CLI's well-known local
// demo key -- so this runs against loopback only.
//
// Usage (the load-test plan must exist locally: supabase/seed-load-test-plan.sql):
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 node scripts/load/mint-voters.mjs [count]

import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const PLAN_ID = "33333333-3333-3333-3333-333333333333";
const OUT_FILE = new URL("./voters.local.json", import.meta.url);
// The CLI's well-known local demo keys -- public, and only valid on a local stack.
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error(`REFUSED: ${url} is not a local stack. This mints accounts with the local admin key.`);
  process.exit(2);
}
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY;
const admin = createClient(url, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });

const count = Number(process.argv[2] ?? 50);
if (!(count > 0)) {
  console.error(`REFUSED: count must be a positive number, got ${JSON.stringify(process.argv[2])}`);
  process.exit(2);
}

const { data: plan, error: planError } = await admin.from("plans").select("id").eq("id", PLAN_ID).maybeSingle();
if (planError || !plan) {
  console.error(`No load-test plan ${PLAN_ID} locally (${planError?.message ?? "not found"}).`);
  console.error("Load supabase/seed-load-test-plan.sql into the local database first.");
  process.exit(1);
}

async function mintOne(i) {
  const email = `load-voter-${Date.now()}-${i}-${randomUUID().slice(0, 6)}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw new Error(`voter ${i}: createUser failed: ${createError?.message}`);

  // Fresh client per voter -- each needs its own independent auth session.
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`voter ${i}: sign-in failed: ${error?.message}`);
  if (data.user.is_anonymous) throw new Error(`voter ${i}: came back anonymous`);

  // The real membership path, under the voter's own session, not an admin insert.
  const { data: claimed, error: claimError } = await client.rpc("claim_plan_access", { p_plan_id: PLAN_ID });
  if (claimError || !claimed) throw new Error(`voter ${i}: claim_plan_access failed: ${claimError?.message ?? "false"}`);

  const participantTokenHash = createHash("sha256").update(`load-test-${randomUUID()}`).digest("hex");
  return { access_token: data.session.access_token, participant_token_hash: participantTokenHash };
}

// Small batches: local GoTrue drops sign-ins past ~30 concurrent (worklog,
// 2026-09-04). Appends to an existing voters.local.json so repeated runs
// accumulate; a failure is reported, never silently dropped from the count.
const BATCH = 8;
const existing = await readFile(OUT_FILE, "utf8").then((raw) => JSON.parse(raw)).catch(() => []);
console.log(`Minting ${count} permanent voter accounts on ${url} for plan ${PLAN_ID}...`);
if (existing.length) console.log(`(${existing.length} already minted from a previous run, reusing + appending)`);

const voters = [...existing];
let failures = 0;
for (let i = 0; i < count; i += BATCH) {
  const size = Math.min(BATCH, count - i);
  const results = await Promise.allSettled(Array.from({ length: size }, (_, j) => mintOne(i + j)));
  for (const r of results) {
    if (r.status === "fulfilled") voters.push(r.value);
    else { failures++; console.error(`  ${r.reason}`); }
  }
  process.stdout.write(`\r  ${voters.length - existing.length}/${count} newly minted`);
}
console.log();
await writeFile(OUT_FILE, JSON.stringify(voters, null, 2));
console.log(`Wrote ${voters.length} voters to ${OUT_FILE.pathname}${failures ? ` -- ${failures} FAILED, see above` : ""}`);
if (failures) process.exit(1);
