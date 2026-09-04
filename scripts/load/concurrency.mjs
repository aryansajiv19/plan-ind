// Concurrency load driver for the write RPCs autocannon can't drive (each
// virtual voter needs its OWN bearer token + participant_token_hash, and
// these scenarios are one-shot bursts of N simultaneous callers, not a
// sustained-duration hammer -- a different shape of test than run.mjs's
// throughput scenarios, hence a separate file).
//
// Hits Supabase's PostgREST RPC endpoint directly -- the real write path;
// there is no Next.js route in front of cast_plan_vote / set_plan_rsvp /
// rate_plan, the client calls supabase.rpc(...) straight from the browser.
//
// Setup:
//   node --env-file=.env.local scripts/load/mint-voters.mjs [count]
// Then:
//   node --env-file=.env.local scripts/load/concurrency.mjs <scenario> [n]
//
// Scenarios: vote-contend, vote-flap, rsvp-contend, rsvp-collide
//
// ponytail: rate_plan shares set_plan_rsvp's exact retry-loop shape
// (migration-025), so rsvp-collide already covers the mechanism under test --
// skipped a rating-collide twin rather than build a second decided-plan
// fixture for duplicate signal.

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const PLAN_ID = "33333333-3333-3333-3333-333333333333";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !apikey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const scenario = process.argv[2];
const n = Number(process.argv[3] ?? (scenario?.includes("contend") ? 20 : 10));
const runId = randomUUID().slice(0, 8);

async function loadVoters(count) {
  const raw = await readFile(new URL("./voters.local.json", import.meta.url), "utf8").catch(() => null);
  if (!raw) {
    console.error("No voters.local.json -- run mint-voters.mjs first.");
    process.exit(1);
  }
  const voters = JSON.parse(raw);
  if (voters.length < count) {
    console.error(`Only ${voters.length} minted voters, need ${count}. Re-run mint-voters.mjs with a higher count.`);
    process.exit(1);
  }
  return voters.slice(0, count);
}

async function rpc(fn, accessToken, body) {
  const start = performance.now();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const ms = performance.now() - start;
  const ok = res.status >= 200 && res.status < 300;
  const payload = await res.json().catch(() => null);
  return { ok, status: res.status, ms, payload };
}

async function readRows(accessToken, table, query) {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey, authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

function report(label, results) {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor((times.length - 1) * p))].toFixed(1);
  const errors = results.filter((r) => !r.ok);
  console.log(`\n── ${label} (n=${results.length}) ─────────────────────`);
  console.log(`p50 ${pct(0.5)}ms  p90 ${pct(0.9)}ms  p99 ${pct(0.99)}ms  max ${times[times.length - 1].toFixed(1)}ms`);
  console.log(`errors: ${errors.length}/${results.length}`);
  if (errors.length) {
    const byMsg = {};
    for (const e of errors) {
      const msg = e.payload?.message ?? `HTTP ${e.status}`;
      byMsg[msg] = (byMsg[msg] ?? 0) + 1;
    }
    for (const [msg, count] of Object.entries(byMsg)) console.log(`  ${count}x ${msg}`);
  }
  return errors.length;
}

async function voteContend() {
  const voters = await loadVoters(n);
  const [spot] = await readRows(
    voters[0].access_token,
    "plan_spots",
    `plan_id=eq.${PLAN_ID}&pool_number=eq.1&select=spot_id&order=spot_id.asc&limit=1`,
  );
  console.log(`${n} voters casting the same vote (spot ${spot.spot_id}) simultaneously...`);
  const results = await Promise.all(
    voters.map((v, i) =>
      // Distinct voter_name per voter -- real guests each type their own
      // display name. A shared name here would hit the still-live legacy
      // votes_round_choice_unique index (see migration 032) and confound the
      // participant_token_hash contention this scenario is actually testing.
      rpc("cast_plan_vote", v.access_token, {
        p_plan_id: PLAN_ID,
        p_spot_id: spot.spot_id,
        p_voter_name: `Load-${runId}-${i}`,
        p_value: true,
        p_phase: "pool",
        p_pool_number: 1,
        p_participant_token_hash: v.participant_token_hash,
      }),
    ),
  );
  report("vote-contend", results);
  const rows = await readRows(
    voters[0].access_token,
    "votes",
    `plan_id=eq.${PLAN_ID}&spot_id=eq.${spot.spot_id}&phase=eq.pool&pool_number=eq.1&value=eq.true&select=id`,
  );
  console.log(`correctness: ${rows.length} vote rows for that spot (expect ${n})`);
}

async function voteFlap() {
  const voters = await loadVoters(n);
  const [spot] = await readRows(
    voters[0].access_token,
    "plan_spots",
    `plan_id=eq.${PLAN_ID}&pool_number=eq.1&select=spot_id&order=spot_id.asc&limit=1`,
  );
  console.log(`${n} voters each toggling true/false/true on the same spot, concurrently...`);
  const start = performance.now();
  const results = await Promise.all(
    voters.map(async (v, i) => {
      const timings = [];
      for (const value of [true, false, true]) {
        timings.push(
          await rpc("cast_plan_vote", v.access_token, {
            p_plan_id: PLAN_ID,
            p_spot_id: spot.spot_id,
            p_voter_name: `Flap-${runId}-${i}`,
            p_value: value,
            p_phase: "pool",
            p_pool_number: 1,
            p_participant_token_hash: v.participant_token_hash,
          }),
        );
      }
      return timings;
    }),
  );
  const flat = results.flat();
  report("vote-flap (all calls)", flat);
  console.log(`wall clock: ${(performance.now() - start).toFixed(1)}ms for ${flat.length} calls`);
  const rows = await readRows(
    voters[0].access_token,
    "votes",
    `plan_id=eq.${PLAN_ID}&spot_id=eq.${spot.spot_id}&phase=eq.pool&pool_number=eq.1&value=eq.true&select=id`,
  );
  console.log(`correctness: ${rows.length} vote rows landed true (expect ${n})`);
}

async function rsvpContend() {
  const voters = await loadVoters(n);
  console.log(`${n} first-time RSVPs, distinct voter names, simultaneously...`);
  const results = await Promise.all(
    voters.map((v, i) =>
      rpc("set_plan_rsvp", v.access_token, {
        p_plan_id: PLAN_ID,
        p_voter_name: `Voter-${runId}-${i}`,
        p_coming: true,
        p_choice: "coming",
        p_participant_token_hash: v.participant_token_hash,
      }),
    ),
  );
  report("rsvp-contend", results);
}

async function rsvpCollide() {
  const voters = await loadVoters(n);
  const name = `Collider-${runId}`;
  console.log(`${n} first-time RSVPs, SAME voter name ("${name}"), simultaneously -- exercises the unbounded retry loop...`);
  const results = await Promise.all(
    voters.map((v) =>
      rpc("set_plan_rsvp", v.access_token, {
        p_plan_id: PLAN_ID,
        p_voter_name: name,
        p_coming: true,
        p_choice: "coming",
        p_participant_token_hash: v.participant_token_hash,
      }),
    ),
  );
  const errors = report("rsvp-collide", results);
  const rows = await readRows(voters[0].access_token, "rsvps", `plan_id=eq.${PLAN_ID}&voter_name=eq.${encodeURIComponent(name)}&select=id`);
  console.log(`correctness: ${rows.length} rsvp row(s) for "${name}" (expect exactly 1)`);
  console.log(`${n - 1} of ${n} calls should have failed with 'That participant name is already in use' (${errors} did)`);
}

const scenarios = { "vote-contend": voteContend, "vote-flap": voteFlap, "rsvp-contend": rsvpContend, "rsvp-collide": rsvpCollide };
const fn = scenarios[scenario];
if (!fn) {
  console.error(`Unknown scenario "${scenario}". Options: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}
await fn();
