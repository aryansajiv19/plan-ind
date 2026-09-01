// Load-test harness. Deliberately conservative defaults (10 connections /
// 10s) — the dev server points at the SAME live Supabase project as
// production, so this isn't a sandbox: keep concurrency low unless you've
// checked in first. Authenticated/mutating scenarios need a real session
// (see --token below) — spot-deal explicitly 401s anonymous sessions.
//
// Usage:
//   node scripts/load/run.mjs home
//   node scripts/load/run.mjs deal --token <supabase access_token>
//   node scripts/load/run.mjs home --connections 20 --duration 20
//
// ponytail: one file, one npm dep (autocannon — no stdlib way to drive
// concurrent HTTP load and report percentiles). Add a scenario by adding an
// entry below, not a new script.

import autocannon from "autocannon";

const BASE_URL = process.env.LOAD_BASE_URL ?? "http://localhost:3000";

const args = process.argv.slice(2);
const scenarioName = args[0];
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const token = flag("token", process.env.LOAD_TOKEN);
const authHeaders = token ? { authorization: `Bearer ${token}` } : {};

const scenarios = {
  // Unauthenticated front door. Cheapest, highest-traffic path — the
  // baseline everything else gets compared against.
  home: {
    url: `${BASE_URL}/`,
    method: "GET",
  },
  // Authenticated deal route. Rejects anonymous sessions (401) and is
  // quota-limited (30/min per user via consume_app_quota) — a --token from a
  // single permanent test account will start 429ing past that, which is
  // useful signal, not an error to chase.
  deal: {
    url: `${BASE_URL}/api/spots/deal`,
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders },
    body: JSON.stringify({ category: "dinner", count: 3 }),
  },
};

const scenario = scenarios[scenarioName];
if (!scenario) {
  console.error(`Unknown scenario "${scenarioName}". Options: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}

const connections = Number(flag("connections", 10));
const duration = Number(flag("duration", 10));

console.log(`Load testing ${scenario.method} ${scenario.url}`);
console.log(`connections=${connections} duration=${duration}s\n`);

const result = await autocannon({
  ...scenario,
  connections,
  duration,
});

const pct = (ms) => `${ms}ms`;
const nonOk = result.non2xx ?? (result.errors + (result["4xx"] ?? 0) + (result["5xx"] ?? 0));

// autocannon's histogram doesn't expose a p95 bucket directly (p90 and
// p97_5 bracket it) — report what it actually measured rather than a
// mislabeled number.
console.log("── Results ─────────────────────────────");
console.log(`p50 latency     ${pct(result.latency.p50)}`);
console.log(`p90 latency     ${pct(result.latency.p90)}`);
console.log(`p97.5 latency   ${pct(result.latency.p97_5)}`);
console.log(`p99 latency     ${pct(result.latency.p99)}`);
console.log(`mean latency    ${pct(result.latency.mean)}`);
console.log(`throughput      ${result.requests.mean.toFixed(1)} req/s (mean)`);
console.log(`total requests  ${result.requests.total}`);
console.log(`non-2xx / errs  ${nonOk} (${((nonOk / result.requests.total) * 100).toFixed(2)}%)`);
console.log(`status codes    ${JSON.stringify(result.statusCodeStats ?? {})}`);
