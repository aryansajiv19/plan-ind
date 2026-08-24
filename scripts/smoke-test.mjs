const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";

// `--020` runs only the migration-020 guards at the bottom of this file. That
// block is expected to be red until the migration is applied, so it lives
// behind its own npm script and never blocks `npm run test:smoke`. It needs no
// dev server, so the HTTP checks are skipped too.
const only020 = process.argv.includes("--020");

async function check(path, expected, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`ok ${path} (${response.status})`);
  return response;
}

if (!only020) {
  const login = await check("/login", 200);
  await check("/home-preview", 200);
  for (const name of ["content-security-policy", "x-content-type-options", "referrer-policy"]) {
    if (!login.headers.get(name)) throw new Error(`/login: missing ${name}`);
    console.log(`ok /login includes ${name}`);
  }
  await check("/terms", 200);
  await check("/privacy", 200);
  await check("/api/plans", 403, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  const setCookie = login.headers.get("set-cookie") ?? "";
  const csrf = /(?:^|[,;]\s*)csrf=([^;,]+)/.exec(setCookie)?.[1];
  if (!csrf) throw new Error("/login: CSRF cookie was not set");
  await check("/api/plans", 401, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(baseUrl).origin,
      cookie: `csrf=${csrf}`,
      "x-csrf-token": csrf,
    },
    body: "{}",
  });
}

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
const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

  if (!only020) {
    // The host token must be invisible: it now lives in plan_host_tokens,
    // which has no select policy, and must not reappear on the plans row.
    const plans = await rest("plans?select=*&limit=1");
    const [plan] = plans.ok ? await plans.json() : [];
    if (plan && "host_token_hash" in plan) throw new Error("plans still exposes host_token_hash to the anon key");
    console.log("ok plans projection carries no host token");

    // Reads: PostgREST answers 200 with [] whether RLS hid the rows or the
    // table is simply empty, so this alone proves little. The insert below is
    // the assertion that can actually fail.
    const tokens = await rest("plan_host_tokens?select=*&limit=1");
    if (tokens.ok && (await tokens.json()).length > 0) throw new Error("plan_host_tokens is readable with the anon key");
    console.log(`ok plan_host_tokens returns no rows to the anon key (${tokens.status})`);

    const tokenWrite = await rest("plan_host_tokens", {
      method: "POST",
      body: JSON.stringify({ plan_id: plan?.id ?? nowhere, token_hash: "f".repeat(64) }),
    });
    if (tokenWrite.ok) throw new Error("plan_host_tokens accepted an anonymous insert");
    console.log(`ok plan_host_tokens rejects a forged host token (${tokenWrite.status})`);

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

  // ── Deployment guards (migration 020) ───────────────────────────
  // Run with `npm run test:smoke:020`. RED until
  // supabase/migration-020-production-security.sql is applied to the live
  // project, GREEN after — that transition is the only proof the paste
  // landed. app/api/plans/route.ts calls create_secure_plan, so while these
  // are red, starting a plan is broken in production.
  //
  // Every guard here asserts a *write* or a *function lookup*, never "a read
  // came back empty": PostgREST answers 200 [] both when RLS hides rows and
  // when the table is simply empty, so a read-only guard would pass on a
  // database that has none of migration 020 in it.
  //
  // Argument names are copied verbatim from the migration. PostgREST resolves
  // a function by its exact set of parameter names, so a typo here reports a
  // missing function that is really present.
  if (only020) {
    // PGRST202 = the function is not in the database. Any other failure means
    // it exists and refused the anon key, which is what it should do — none of
    // these are callable without a session.
    async function rpcExists(label, fn, args) {
      const response = await rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
      const body = await response.json().catch(() => ({}));
      if (body.code === "PGRST202") {
        throw new Error(`${label}: ${fn} is missing (PGRST202) — migration 020 is not applied to this project`);
      }
      if (response.ok) throw new Error(`${label}: ${fn} accepted an anonymous call and must not`);
      console.log(`ok ${label} (${response.status} ${body.code})`);
    }

    // PGRST205 = the table is not in the database.
    async function tableRejects(label, table, row) {
      const response = await rest(table, { method: "POST", body: JSON.stringify(row) });
      const body = await response.json().catch(() => ({}));
      if (body.code === "PGRST205") {
        throw new Error(`${label}: table ${table} is missing (PGRST205) — migration 020 is not applied to this project`);
      }
      if (response.ok) throw new Error(`${label}: ${table} accepted an anonymous insert`);
      console.log(`ok ${label} (${response.status} ${body.code})`);
    }

    // The outage guard. This is the one that is red today.
    await rpcExists("plan creation RPC exists", "create_secure_plan", {
      p_plan: { title: "Smoke", category: "dinner" }, p_spot_ids: [],
    });

    await rpcExists("share-link redemption RPC exists", "claim_plan_access", { p_plan_id: nowhere });

    // Also covers the forged-secret path: the function raises 42501 on a
    // wrong p_secret, so a 2xx here would mean the quota is bypassable.
    await rpcExists("quota RPC exists and refuses a forged secret", "consume_app_quota", {
      p_secret: "not-the-server-secret", p_scope: "plan-create",
    });

    await rpcExists("security event RPC exists and refuses a forged secret", "record_security_event", {
      p_secret: "not-the-server-secret", p_event_type: "captcha", p_outcome: "failure",
    });

    // Takes no arguments — the migration revokes execute from anon and
    // authenticated outright, so this must exist and still refuse the key.
    // (The task brief described a p_secret parameter; the migration has none.)
    await rpcExists("data purge job exists and refuses the anon key", "purge_security_operational_data", {});

    // 020 revokes insert/update/delete on these from anon and authenticated:
    // every plan write must go through create_secure_plan. Rejected before the
    // migration too (by RLS), so this guards the revoke, not the deployment.
    await tableRejects("plans refuses a direct anonymous insert", "plans", {
      title: "Smoke", category: "dinner", deadline: "2999-01-01T00:00:00Z",
    });
    await tableRejects("plan_spots refuses a direct anonymous insert", "plan_spots", {
      plan_id: nowhere, spot_id: nowhere, pool_number: 1,
    });

    // plan_access is the capability table: a forged row here would hand the
    // holder read access to someone else's plan and its votes.
    await tableRejects("plan_access refuses a forged membership", "plan_access", {
      plan_id: nowhere, user_id: nowhere,
    });

    // security_events has RLS on and no policy at all.
    await tableRejects("security_events refuses an anonymous insert", "security_events", {
      event_type: "captcha", outcome: "failure",
    });

    // Meaningful only because the insert above already proved the table
    // exists: a row coming back here would mean someone added a select policy
    // and the audit log is now public.
    const events = await rest("security_events?select=id&limit=1");
    const eventRows = await events.json().catch(() => []);
    if (events.ok && Array.isArray(eventRows) && eventRows.length > 0) {
      throw new Error("security_events returns rows to the anon key — the audit log is readable by anyone with the publishable key");
    }
    console.log(`ok security_events returns no rows to the anon key (${events.status})`);

    // Last, because it is the one guard that is red on a correctly applied
    // migration 020 — everything above it must report first.
    //
    // Line 352 of the migration revokes valid_control_secret from PUBLIC, which
    // does NOT cancel the grant Supabase's default privileges already made to
    // anon by name; only an explicit `revoke ... from anon, authenticated` (as
    // used on purge_security_operational_data) does. While this is red the anon
    // key has an unmetered oracle for guessing the server-control secret that
    // gates consume_app_quota and record_security_event. Owner: backend-data.
    await rpcExists("control-secret oracle is not callable by the anon key", "valid_control_secret", {
      p_secret: "not-the-server-secret",
    });
  }
}

console.log(only020 ? "Migration 020 guards passed." : "Smoke checks passed.");
