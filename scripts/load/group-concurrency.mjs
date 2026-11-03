// Concurrency driver for the group-preferences RPCs (migration 100): bursts of
// simultaneous callers against the real write path (PostgREST -> security
// definer function), each checked against what actually landed in Postgres.
//
//   prefs-burst [n]    n members each double-tap Save (2n calls at once)
//                      -> exactly n plan_preferences rows, each holding one of
//                         that member's two submitted values
//   deal-race [k]      the host fires start_group_plan k times at once
//                      -> exactly 1 "dealt", k-1 "not_gathering", 9 plan_spots
//   prefs-vs-deal [n]  n members save at the same instant the host deals
//                      -> every "ok" reply has its row; no row without an "ok"
//
// LOCAL stack only (it mints accounts with the CLI's demo admin key):
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:57321 DB=postgresql://...:57322/postgres \
//     node scripts/load/group-concurrency.mjs <scenario> [n] [--reps 5]
// Each rep builds a fresh plan, so reps are independent samples.

import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const db = process.env.DB;
const local = (u) => /^(https?|postgresql):\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u ?? "");
if (!local(url) || !local(db)) {
  console.error("REFUSED: NEXT_PUBLIC_SUPABASE_URL and DB must both point at a local stack.");
  process.exit(2);
}

const [scenario, nArg] = process.argv.slice(2);
const n = Number(nArg ?? 20);
const repsAt = process.argv.indexOf("--reps");
const reps = repsAt > 0 ? Number(process.argv[repsAt + 1]) : 5;
if (!["prefs-burst", "deal-race", "prefs-vs-deal"].includes(scenario) || !(n > 0) || !(reps > 0)) {
  console.error("usage: group-concurrency.mjs prefs-burst|deal-race|prefs-vs-deal [n] [--reps 5]");
  process.exit(2);
}

const admin = createClient(url, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });
const sql = (query) => execFileSync("psql", [db, "-Atc", query], { encoding: "utf8" }).trim();

async function account(label) {
  const email = `group-load-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomBytes(18).toString("base64url");
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: createUser: ${error.message}`);
  const client = createClient(url, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !data.session) throw new Error(`${label}: sign-in: ${signInError?.message}`);
  const { error: ageError } = await client.rpc("set_birth_date", { p_date_of_birth: "1995-05-05" });
  if (ageError) throw new Error(`${label}: set_birth_date: ${ageError.message}`);
  return { client, token: data.session.access_token, id: data.user.id };
}

// One raw PostgREST call, timed from the client: the same request the browser makes.
async function rpc(token, name, args) {
  const started = performance.now();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: LOCAL_ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);
  return { ms: performance.now() - started, status: response.status, body };
}

async function gatheringPlan(memberCount) {
  const host = await account("host");
  const { data: plan, error } = await host.client.rpc("create_gathering_plan", { p_plan: { title: "Load test", category: "dinner" } });
  if (error) throw new Error(`create_gathering_plan: ${error.message}`);
  const members = [];
  for (let i = 0; i < memberCount; i += 8) {
    members.push(...await Promise.all(Array.from({ length: Math.min(8, memberCount - i) }, async (_, j) => {
      const m = await account(`m${i + j}`);
      const { error: claimError } = await m.client.rpc("claim_plan_access", { p_plan_id: plan.id });
      if (claimError) throw new Error(`claim_plan_access: ${claimError.message}`);
      return m;
    })));
  }
  return { planId: plan.id, host, members };
}

const prefs = (planId, budget) => ({ p_plan_id: planId, p_budget_cap: budget, p_origin_value: null, p_vibes: ["chill"], p_avoid: [] });
const spotIds = sql("select string_agg(id::text, ',') from (select id from spots where source = 'curated' order by id limit 9) s").split(",");
const deal = (planId) => ({ p_plan_id: planId, p_spot_ids: spotIds, p_group: { relaxed: [] } });
const resultOf = (r) => (r.body && typeof r.body === "object" ? r.body.result : undefined);

async function prefsBurst() {
  const { planId, members } = await gatheringPlan(n);
  const calls = members.flatMap((m, i) => [100 + i, 5000 + i].map((budget) => () => rpc(m.token, "set_plan_preferences", prefs(planId, budget))));
  const replies = await Promise.all(calls.map((call) => call()));
  const rows = sql(`select user_id || ':' || budget_cap from plan_preferences where plan_id = '${planId}'`).split("\n").filter(Boolean);
  const byUser = new Map(rows.map((row) => row.split(":")));
  const problems = [];
  if (replies.some((r) => r.status !== 200)) problems.push(`non-200: ${JSON.stringify(replies.find((r) => r.status !== 200))}`);
  if (rows.length !== n) problems.push(`${rows.length} rows for ${n} members`);
  members.forEach((m, i) => {
    const kept = Number(byUser.get(m.id));
    if (kept !== 100 + i && kept !== 5000 + i) problems.push(`member ${i} kept ${kept}, submitted ${100 + i}/${5000 + i}`);
  });
  return { replies, problems };
}

async function dealRace() {
  const { planId, host } = await gatheringPlan(0);
  const replies = await Promise.all(Array.from({ length: n }, () => rpc(host.token, "start_group_plan", deal(planId))));
  const dealt = replies.filter((r) => resultOf(r) === "dealt").length;
  const refused = replies.filter((r) => resultOf(r) === "not_gathering").length;
  const placed = Number(sql(`select count(*) from plan_spots where plan_id = '${planId}'`));
  const stage = sql(`select stage from plans where id = '${planId}'`);
  const problems = [];
  if (dealt !== 1) problems.push(`${dealt} calls dealt (want exactly 1)`);
  if (refused !== n - 1) problems.push(`${refused} not_gathering (want ${n - 1}); others: ${JSON.stringify(replies.filter((r) => !["dealt", "not_gathering"].includes(resultOf(r))).slice(0, 2))}`);
  if (placed !== 9) problems.push(`${placed} plan_spots (want 9)`);
  if (stage !== "pool") problems.push(`stage ${stage} (want pool)`);
  return { replies, problems };
}

async function prefsVsDeal() {
  const { planId, host, members } = await gatheringPlan(n);
  const [dealReply, ...replies] = await Promise.all([
    rpc(host.token, "start_group_plan", deal(planId)),
    ...members.map((m, i) => rpc(m.token, "set_plan_preferences", prefs(planId, 100 + i))),
  ]);
  const saved = new Set(members.filter((_, i) => replies[i].status === 200 && resultOf(replies[i]) !== "not_gathering").map((m) => m.id));
  const rows = new Set(sql(`select user_id from plan_preferences where plan_id = '${planId}'`).split("\n").filter(Boolean));
  const problems = [];
  if (resultOf(dealReply) !== "dealt") problems.push(`deal answered ${JSON.stringify(dealReply.body)}`);
  for (const id of saved) if (!rows.has(id)) problems.push(`"saved" reply with no row (${id})`);
  for (const id of rows) if (!saved.has(id)) problems.push(`row with no "saved" reply (${id})`);
  const odd = replies.filter((r) => r.status !== 200);
  if (odd.length) problems.push(`${odd.length} non-200, e.g. ${JSON.stringify(odd[0].body)}`);
  // Once the deal has committed, every save must be refused and write nothing.
  const late = await Promise.all(members.map((m, i) => rpc(m.token, "set_plan_preferences", prefs(planId, 900 + i))));
  const lateSaved = late.filter((r) => resultOf(r) !== "not_gathering").length;
  if (lateSaved) problems.push(`${lateSaved} saves accepted after the deal`);
  const after = Number(sql(`select count(*) from plan_preferences where plan_id = '${planId}' and budget_cap >= 900`));
  if (after) problems.push(`${after} rows written after the deal`);
  return { replies: [dealReply, ...replies, ...late], problems, note: `${saved.size}/${n} saved before the deal` };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const run = { "prefs-burst": prefsBurst, "deal-race": dealRace, "prefs-vs-deal": prefsVsDeal }[scenario];
const all = [];
let failed = 0;
for (let rep = 1; rep <= reps; rep++) {
  const { replies, problems, note } = await run();
  all.push(...replies.map((r) => r.ms));
  failed += problems.length ? 1 : 0;
  console.log(`rep ${rep}: ${replies.length} calls, ${problems.length ? `FAIL ${problems.join("; ")}` : "ok"}${note ? ` (${note})` : ""}`);
}
const sorted = all.sort((a, b) => a - b);
console.log(`${scenario} n=${n} reps=${reps}: ${sorted.length} calls  p50 ${pct(sorted, 50).toFixed(1)}ms  p95 ${pct(sorted, 95).toFixed(1)}ms  p99 ${pct(sorted, 99).toFixed(1)}ms  max ${sorted.at(-1).toFixed(1)}ms  -> ${failed ? `${failed}/${reps} reps FAILED` : "all reps correct"}`);
process.exit(failed ? 1 : 0);
