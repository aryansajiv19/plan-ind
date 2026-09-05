// Scale load driver against the LOCAL Supabase stack + local app server
// (see scripts/load/README.md's "Scale testing" section for full setup).
// Reuses concurrency.mjs's percentile-reporting shape but targets local
// infrastructure with real permanent-account sessions (cookie-based, since
// the app's own API routes read auth from cookies via @supabase/ssr, not a
// bearer header -- see mint-local-users.mjs).
//
// Usage:
//   node --env-file=.env.local scripts/load/scale.mjs <scenario> [n]
//
// Scenarios: vote-scale, rsvp-scale, plan-create-scale, spot-deal-scale

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const LOCAL_DB_URL = "http://127.0.0.1:54321";
// Overridable so two builds can be compared against each other. This server's
// first runs are much slower than its later ones (JIT warm-up), and that
// drift is bigger than the difference a routing change makes -- so measuring
// build A then build B measures the warm-up, not the change. Start both on
// different ports and alternate between them instead.
const LOCAL_APP_URL = process.env.LOAD_APP_URL ?? "http://localhost:3010";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const scenario = process.argv[2];
const n = Number(process.argv[3] ?? 500);
const runId = randomUUID().slice(0, 8);

async function loadUsers(count) {
  const raw = await readFile(new URL("./local-users.local.json", import.meta.url), "utf8").catch(() => null);
  if (!raw) { console.error("No local-users.local.json -- run mint-local-users.mjs first."); process.exit(1); }
  const users = JSON.parse(raw);
  if (users.length < count) { console.error(`Only ${users.length} minted users, need ${count}.`); process.exit(1); }
  // Shuffle so a small n samples across many plans, not the first N users
  // (which round-robin-assigned sequentially, so a small slice would
  // otherwise land on only 1-2 plans).
  return users.map((u) => [Math.random(), u]).sort((a, b) => a[0] - b[0]).map(([, u]) => u).slice(0, count);
}

// At real concurrency a fully-simultaneous Promise.all can hit a raw socket
// error (Kong/PostgREST connection limits, not an app-level failure) -- that
// must land in the report as an error result, not crash the whole run and
// lose every other in-flight request's data.
async function rpc(fn, accessToken, body) {
  const start = performance.now();
  try {
    const res = await fetch(`${LOCAL_DB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const ms = performance.now() - start;
    const ok = res.status >= 200 && res.status < 300;
    const payload = await res.json().catch(() => null);
    return { ok, status: res.status, ms, payload };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - start, payload: { message: error instanceof Error ? error.message : String(error) } };
  }
}

async function apiCall(path, cookieHeader, body) {
  const csrf = randomUUID();
  const start = performance.now();
  try {
    const res = await fetch(`${LOCAL_APP_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: LOCAL_APP_URL,
        "sec-fetch-site": "same-origin",
        cookie: `__Host-csrf=${csrf}; ${cookieHeader}`,
        "x-csrf-token": csrf,
      },
      body: JSON.stringify(body),
    });
    const ms = performance.now() - start;
    const ok = res.status >= 200 && res.status < 300;
    const payload = await res.json().catch(() => null);
    return { ok, status: res.status, ms, payload };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - start, payload: { message: error instanceof Error ? error.message : String(error) } };
  }
}

function report(label, results) {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((times.length - 1) * p))].toFixed(1);
  const errors = results.filter((r) => !r.ok);
  console.log(`\n── ${label} (n=${results.length}) ─────────────────────`);
  console.log(`p50 ${pct(0.5)}ms  p90 ${pct(0.9)}ms  p97.5 ${pct(0.975)}ms  p99 ${pct(0.99)}ms  max ${times[times.length - 1].toFixed(1)}ms`);
  console.log(`throughput (n / total wall time): see wall-clock line below`);
  console.log(`errors: ${errors.length}/${results.length}`);
  if (errors.length) {
    const byMsg = {};
    for (const e of errors) {
      const msg = e.payload?.message ?? e.payload?.error ?? `HTTP ${e.status}`;
      byMsg[msg] = (byMsg[msg] ?? 0) + 1;
    }
    for (const [msg, count] of Object.entries(byMsg)) console.log(`  ${count}x ${msg}`);
  }
}

// One lookup per distinct plan, not per user -- at n in the hundreds/
// thousands spread across only 50 plans, a per-user lookup would be mostly
// redundant (~n/50 repeats of the same query). RLS is membership-scoped
// ("read accessible plan spots" via plan_access), so this MUST use a token
// belonging to a user who actually has access to that specific plan -- a
// single shared token only sees its own one plan and returns `200 []` (a
// real RLS behavior, not a bug: house-rules' own warning that empty reads
// are ambiguous applies here) for every other plan.
async function planSpotMap(users) {
  const oneUserPerPlan = new Map();
  for (const u of users) if (!oneUserPerPlan.has(u.planId)) oneUserPerPlan.set(u.planId, u.accessToken);
  const map = {};
  await Promise.all(
    [...oneUserPerPlan].map(async ([planId, accessToken]) => {
      const res = await fetch(`${LOCAL_DB_URL}/rest/v1/plan_spots?plan_id=eq.${planId}&pool_number=eq.1&select=spot_id&order=spot_id.asc&limit=1`, {
        headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${accessToken}` },
      });
      const [row] = await res.json();
      if (row) map[planId] = row.spot_id;
    }),
  );
  return map;
}

async function voteScale() {
  const users = await loadUsers(n);
  console.log(`${n} users, spread across their assigned plans, casting one vote each simultaneously...`);
  const spotByPlan = await planSpotMap(users);
  const start = performance.now();
  const results = await Promise.all(
    users.map((u, i) => {
      const spotId = spotByPlan[u.planId];
      if (!spotId) return Promise.resolve({ ok: false, status: 0, ms: 0, payload: { message: "no plan_spots row" } });
      return rpc("cast_plan_vote", u.accessToken, {
        p_plan_id: u.planId, p_spot_id: spotId, p_voter_name: `Scale-${runId}-${i}`,
        p_value: true, p_phase: "pool", p_pool_number: 1, p_participant_token_hash: u.participantTokenHash,
      });
    }),
  );
  const wallMs = performance.now() - start;
  report("vote-scale", results);
  console.log(`wall clock: ${wallMs.toFixed(0)}ms (${(results.length / (wallMs / 1000)).toFixed(1)} req/s effective, across ${new Set(users.map((u) => u.planId)).size} distinct plans)`);
}

async function rsvpScale() {
  const users = await loadUsers(n);
  console.log(`${n} first-time RSVPs, distinct names, spread across plans, simultaneously...`);
  const start = performance.now();
  const results = await Promise.all(
    users.map((u, i) =>
      rpc("set_plan_rsvp", u.accessToken, {
        p_plan_id: u.planId, p_voter_name: `RsvpScale-${runId}-${i}`, p_coming: true, p_choice: "coming",
        p_participant_token_hash: u.participantTokenHash,
      }),
    ),
  );
  const wallMs = performance.now() - start;
  report("rsvp-scale", results);
  console.log(`wall clock: ${wallMs.toFixed(0)}ms (${(results.length / (wallMs / 1000)).toFixed(1)} req/s effective)`);
}

async function planCreateScale() {
  const users = await loadUsers(n);
  const spotsRes = await fetch(`${LOCAL_DB_URL}/rest/v1/spots?source=eq.curated&select=id&limit=82`, {
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${users[0].accessToken}` },
  });
  const spots = await spotsRes.json();
  console.log(`${n} users creating a real plan (POST /api/plans) simultaneously, ${spots.length} curated spots available to draw from...`);
  const start = performance.now();
  const results = await Promise.all(
    users.map((u) => {
      const nineSpots = [...spots].sort(() => Math.random() - 0.5).slice(0, 9).map((s) => s.id);
      return apiCall("/api/plans", u.cookieHeader, {
        title: `Scale plan ${runId}`, category: "dinner", spotIds: nineSpots,
        deadline: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
    }),
  );
  const wallMs = performance.now() - start;
  report("plan-create-scale", results);
  console.log(`wall clock: ${wallMs.toFixed(0)}ms (${(results.length / (wallMs / 1000)).toFixed(1)} req/s effective)`);
}

async function spotDealScale() {
  const users = await loadUsers(n);
  console.log(`${n} users calling POST /api/spots/deal simultaneously...`);
  const start = performance.now();
  const results = await Promise.all(users.map((u) => apiCall("/api/spots/deal", u.cookieHeader, { category: "dinner", count: 3 })));
  const wallMs = performance.now() - start;
  report("spot-deal-scale", results);
  console.log(`wall clock: ${wallMs.toFixed(0)}ms (${(results.length / (wallMs / 1000)).toFixed(1)} req/s effective)`);
}

const scenarios = { "vote-scale": voteScale, "rsvp-scale": rsvpScale, "plan-create-scale": planCreateScale, "spot-deal-scale": spotDealScale };
const fn = scenarios[scenario];
if (!fn) { console.error(`Unknown scenario "${scenario}". Options: ${Object.keys(scenarios).join(", ")}`); process.exit(1); }
await fn();
