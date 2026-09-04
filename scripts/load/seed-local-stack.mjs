// Seeds a LOCAL Supabase stack (`npx supabase start`) for scale load
// testing -- copies the real curated catalog from the live project
// (read-only, source='curated' rows are publicly readable) and creates N
// plans built from it. Guarded to only ever write to a loopback URL: this
// script must never be pointable at production, even by a copy-paste
// mistake.
//
// Usage:
//   node --env-file=.env.local scripts/load/seed-local-stack.mjs [planCount]
//
// Prereqs: `npx supabase start`, then load supabase/schema.sql via psql and
// seed app_control_secrets -- see scripts/load/README.md.

import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
// The Supabase CLI's well-known local demo service_role key -- identical on
// every machine that runs `supabase start`, published in Supabase's own
// docs, never a real secret. Bypasses RLS for local seeding only.
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const liveUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const liveKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!liveUrl || !liveKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the live-catalog read.");
  process.exit(1);
}

const planCount = Number(process.argv[2] ?? 50);

const live = createClient(liveUrl, liveKey, { auth: { persistSession: false } });
const local = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });

// `spots`' "read permitted spots" RLS policy is granted `to authenticated`,
// not `anon` -- a bare anon-key client with no session reads zero rows. One
// throwaway anonymous session for this one read is a trivial cost against
// the live rate limit (this script needs exactly one, not thousands).
const { error: liveAuthError } = await live.auth.signInAnonymously();
if (liveAuthError) throw new Error(`Live anonymous sign-in failed: ${liveAuthError.message}`);

console.log(`Copying curated spots from the live project (${liveUrl}) into the local stack (${LOCAL_URL})...`);
const { data: curatedSpots, error: readError } = await live.from("spots").select("*").eq("source", "curated");
if (readError) throw new Error(`Reading live curated spots failed: ${readError.message}`);
console.log(`Read ${curatedSpots.length} curated spots.`);

const { error: writeError } = await local.from("spots").upsert(curatedSpots, { onConflict: "id" });
if (writeError) throw new Error(`Writing to local stack failed: ${writeError.message}`);
console.log(`Wrote ${curatedSpots.length} curated spots to the local stack.`);

// Re-runnable: clear out any plans this script created before, so a re-run
// (e.g. after fixing a bug like the anon-read one above) doesn't pile up
// empty duplicates.
const { error: cleanupError } = await local.from("plans").delete().like("title", "Scale test plan %");
if (cleanupError) throw new Error(`Cleanup of previous scale-test plans failed: ${cleanupError.message}`);

console.log(`\nSeeding ${planCount} plans (3 curated spots each, no owner yet)...`);
const planIds = [];
for (let i = 0; i < planCount; i++) {
  const { data: plan, error: planError } = await local
    .from("plans")
    .insert({
      title: `Scale test plan ${i}`,
      category: "dinner",
      area: "Dubai",
      deadline: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      status: "open",
      stage: "pool",
      pool_count: 1,
      budget_per_person: 250,
      origin_label: "Downtown / DIFC",
    })
    .select("id")
    .single();
  if (planError || !plan) throw new Error(`Plan ${i} insert failed: ${planError?.message}`);
  planIds.push(plan.id);

  // 3 spots, shuffled from the real catalog, one pool -- matches the
  // dedicated single-plan fixture's shape from the first load-test pass,
  // just repeated across many plans instead of one.
  const shuffled = [...curatedSpots].sort(() => Math.random() - 0.5).slice(0, 3);
  const { error: spotsError } = await local
    .from("plan_spots")
    .insert(shuffled.map((s) => ({ plan_id: plan.id, spot_id: s.id, pool_number: 1, advanced: false })));
  if (spotsError) throw new Error(`Plan ${i} plan_spots insert failed: ${spotsError.message}`);
}
console.log(`Wrote ${planIds.length} plans.`);
console.log(`\nplan ids (first 5): ${planIds.slice(0, 5).join(", ")}`);
