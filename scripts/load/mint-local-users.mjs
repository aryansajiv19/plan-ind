// Mints thousands of PERMANENT test accounts against a LOCAL Supabase stack
// (`npx supabase start`) -- no rate limit, since it's a local Docker
// container, not the live hosted GoTrue. Closes both gaps the first
// load-test pass hit: GoTrue's live anonymous-signup rate limit (capped
// minting at ~15), and no self-serve way to mint a *permanent* session for
// /api/plans and /api/spots/deal (both 401 anonymous sessions).
//
// Guarded to only ever run against a loopback URL -- this must never be
// pointable at production, even by a copy-paste mistake.
//
// Usage:
//   node --env-file=.env.local scripts/load/mint-local-users.mjs [count]
//
// Prereq: scripts/load/seed-local-stack.mjs already ran (plans + curated
// spots exist locally).

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(LOCAL_URL)) {
  throw new Error("Refusing to run: target is not loopback.");
}

const OUT_FILE = new URL("./local-users.local.json", import.meta.url);
const count = Number(process.argv[2] ?? 2000);
const HOST_FRACTION = 0.02; // ~2% of minted users also become a plan's host

const admin = createClient(LOCAL_URL, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });

const { data: plans, error: plansError } = await admin.from("plans").select("id").like("title", "Scale test plan %");
if (plansError || !plans?.length) throw new Error(`No seeded plans found -- run seed-local-stack.mjs first (${plansError?.message})`);
console.log(`${plans.length} seeded plans found. Minting ${count} permanent test users...`);

const sha256hex = (input) => createHash("sha256").update(input).digest("hex");

async function mintOne(i) {
  const email = `scale-test-${i}-${Date.now()}@example.test`;
  const password = randomBytes(16).toString("hex");
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError || !created.user) throw new Error(`createUser ${i} failed: ${createError?.message}`);

  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw new Error(`signIn ${i} failed: ${signInError?.message}`);

  // The app's API routes read the session from cookies via @supabase/ssr's
  // createServerClient (lib/supabase/server.ts), not an Authorization
  // header -- a raw bearer token 401s. Rather than hand-reimplement
  // @supabase/ssr's cookie serialization (chunking included, version-
  // dependent), reuse the real library: run setSession() through the same
  // createServerClient shape with a capturing cookie jar, and keep whatever
  // it actually writes.
  const jar = {};
  const cookieClient = createServerClient(LOCAL_URL, LOCAL_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (toSet) => { for (const { name, value } of toSet) jar[name] = value; },
    },
  });
  await cookieClient.auth.setSession({ access_token: signedIn.session.access_token, refresh_token: signedIn.session.refresh_token });
  const cookieHeader = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join("; ");

  const plan = plans[i % plans.length];
  const participantTokenHash = sha256hex(`local-scale-${created.user.id}`);

  // Real guest sessions get plan_access via the claim_plan_access RPC; here
  // we already have a service-role client, so a direct insert is faster and
  // exercises the exact same downstream state, not the RPC path itself
  // (which is already exercised elsewhere, e.g. the first load-test pass).
  await admin.from("plan_access").insert({ plan_id: plan.id, user_id: created.user.id });

  let hostToken = null;
  if (Math.random() < HOST_FRACTION) {
    hostToken = randomBytes(32).toString("hex"); // 64 hex chars, matches the route's format check
    await admin.from("plans").update({ created_by_user_id: created.user.id }).eq("id", plan.id).is("created_by_user_id", null);
    await admin.from("plan_host_tokens").upsert({ plan_id: plan.id, token_hash: sha256hex(hostToken) }, { onConflict: "plan_id" });
  }

  return { userId: created.user.id, accessToken: signedIn.session.access_token, cookieHeader, planId: plan.id, participantTokenHash, hostToken };
}

// Resilient + incremental: a transient local GoTrue/Docker hiccup at scale
// (observed around ~2100 users into a 2500 run) must not lose everything
// minted so far, and a handful of per-user failures shouldn't abort the
// whole batch -- retry twice, then skip and note it.
// BATCH=30 with the setSession() cookie-derivation step overwhelmed local
// GoTrue's connection handling past ~1200 users (a long unbroken run of
// failures, not scattered ones -- resource exhaustion, not a per-user
// issue). Lower concurrency + a small inter-batch pause let connections
// recycle; still fast enough locally (no live rate limit to fight).
const BATCH = 8;
const BATCH_DELAY_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const users = [];
let failures = 0;
for (let i = 0; i < count; i += BATCH) {
  const indices = Array.from({ length: Math.min(BATCH, count - i) }, (_, j) => i + j);
  const results = await Promise.allSettled(
    indices.map(async (idx) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          return await mintOne(idx);
        } catch (error) {
          if (attempt === 3) throw error;
          await sleep(300 * (attempt + 1));
        }
      }
    }),
  );
  for (const r of results) {
    if (r.status === "fulfilled") users.push(r.value);
    else failures++;
  }
  process.stdout.write(`\r  ${users.length}/${count} minted (${failures} failed after retries)`);
  await writeFile(OUT_FILE, JSON.stringify(users, null, 2));
  await sleep(BATCH_DELAY_MS);
}
console.log();
console.log(`Wrote ${users.length} users to ${OUT_FILE.pathname} (${users.filter((u) => u.hostToken).length} are plan hosts, ${failures} failed after 3 attempts).`);
