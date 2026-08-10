const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";

async function check(path, expected, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`ok ${path} (${response.status})`);
}

await check("/login", 200);
await check("/home-preview", 200);
await check("/api/plans", 401, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

// ── Database guards (migration 019) ───────────────────────────────
// These run against the live project with the anon key — exactly the
// access a hostile browser has. They assert that the things the RLS
// policies and RPCs are supposed to refuse are actually refused, which is
// the half a status-code check cannot see.

const env = Object.fromEntries(
  (await import("node:fs")).readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.log("skip database guards (no Supabase credentials in .env.local)");
} else {
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" };
  const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const token = "a".repeat(64); // well-formed hash, no claim behind it
  const nowhere = "00000000-0000-0000-0000-000000000000";

  async function rpcRejects(label, fn, args) {
    const response = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
    if (response.ok) throw new Error(`${label}: expected a rejection, the write succeeded`);
    console.log(`ok ${label} (${response.status})`);
  }

  // The host token must be invisible: it now lives in plan_host_tokens,
  // which has no select policy, and must not reappear on the plans row.
  const plans = await rest("plans?select=*&limit=1");
  const [plan] = plans.ok ? await plans.json() : [];
  if (plan && "host_token_hash" in plan) throw new Error("plans still exposes host_token_hash to the anon key");
  console.log("ok plans projection carries no host token");

  const tokens = await rest("plan_host_tokens?select=*&limit=1");
  if (tokens.ok && (await tokens.json()).length > 0) throw new Error("plan_host_tokens is readable with the anon key");
  console.log(`ok plan_host_tokens is not readable (${tokens.status})`);

  await rpcRejects("vote with a malformed participant token", "cast_plan_vote", {
    p_plan_id: plan?.id ?? nowhere, p_spot_id: nowhere, p_voter_name: "Smoke",
    p_value: true, p_phase: "pool", p_pool_number: 1, p_participant_token_hash: "nope",
  });

  await rpcRejects("vote with an empty name", "cast_plan_vote", {
    p_plan_id: plan?.id ?? nowhere, p_spot_id: nowhere, p_voter_name: "   ",
    p_value: true, p_phase: "pool", p_pool_number: 1, p_participant_token_hash: token,
  });

  await rpcRejects("vote on a spot that is not on the plan", "cast_plan_vote", {
    p_plan_id: plan?.id ?? nowhere, p_spot_id: nowhere, p_voter_name: "Smoke",
    p_value: true, p_phase: "pool", p_pool_number: 1, p_participant_token_hash: token,
  });

  await rpcRejects("vote in a round that does not exist", "cast_plan_vote", {
    p_plan_id: plan?.id ?? nowhere, p_spot_id: nowhere, p_voter_name: "Smoke",
    p_value: true, p_phase: "pool", p_pool_number: 99, p_participant_token_hash: token,
  });

  await rpcRejects("rate a place the group did not choose", "rate_plan", {
    p_plan_id: plan?.id ?? nowhere, p_spot_id: nowhere, p_voter_name: "Smoke",
    p_stars: 5, p_again: true, p_participant_token_hash: token,
  });

  await rpcRejects("set a birth date without signing in", "set_birth_date", {
    p_date_of_birth: "1990-01-01",
  });

  // member_ages has a select-own policy and no write policy at all, so an
  // anonymous insert is the age gate's last line of defence.
  const ageWrite = await rest("member_ages", {
    method: "POST",
    body: JSON.stringify({ user_id: nowhere, date_of_birth: "1990-01-01" }),
  });
  if (ageWrite.ok) throw new Error("member_ages accepted an anonymous insert");
  console.log(`ok member_ages rejects a direct write (${ageWrite.status})`);
}

console.log("Smoke checks passed.");
