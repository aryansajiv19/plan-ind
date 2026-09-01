// Integration tests for migration 023 — cast_plan_vote idempotency and the
// winner-deciding tally's behaviour under a concurrent double-vote.
//
// These run against a REAL Postgres (RLS + the votes_require_plan_access
// trigger + the security-definer RPC + the votes_participant_round_key unique
// index). A pure-function unit test cannot cover any of those, so there is no
// mock here on purpose.
//
// Not picked up by `npm test` (glob is tests/*.test.ts) — run with `npm run
// test:db`. Skips itself, loudly, when no database is reachable or migration
// 023 is not applied. See tests/README.md for the infra it needs.
//
// NEVER point TEST_DATABASE_URL at the live project: schema.sql DROPs all
// tables and these tests write throwaway rows.

import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes, createHash } from "node:crypto";

const execFileAsync = promisify(execFile);

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Each psql invocation is its own OS process = its own Postgres backend, which
// is exactly what the concurrency test needs (two real parallel connections).
async function psql(sql: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "psql",
      [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 },
    );
    return stdout.trim();
  } catch (err: any) {
    const detail = String(err?.stderr ?? err?.message ?? err).trim();
    throw new Error(detail);
  }
}

const q = (s: string) => `'${s}'`;

async function detectSkip(): Promise<string | false> {
  try {
    await psql("select 1");
  } catch (err: any) {
    return `no reachable Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL Supabase (never the live project). ${String(err.message).split("\n")[0]}`;
  }
  try {
    await psql("select auth.uid()");
  } catch {
    return "auth.uid() is missing — this DB is not a Supabase instance. Load supabase/schema.sql via `supabase start`.";
  }
  let ret: string;
  try {
    ret = await psql(
      `select pg_get_function_result('public.cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text)'::regprocedure)`,
    );
  } catch {
    return "cast_plan_vote(uuid,uuid,text,boolean,text,smallint,text) not found — migration 023 not applied";
  }
  if (ret !== "jsonb") {
    return `cast_plan_vote returns '${ret}', expected 'jsonb' — migration 023 not applied`;
  }
  const idx = await psql(
    `select count(*) from pg_indexes where indexname = 'votes_participant_round_key'`,
  ).catch(() => "0");
  if (idx !== "1") {
    return "votes_participant_round_key unique index missing — migration 023 not applied";
  }
  return false;
}

const SKIP = await detectSkip();

// ── fixtures ───────────────────────────────────────────────────────────────

type Plan = { id: string; spots: string[]; hostToken: string };
type Participant = { uid: string; hash: string };

const madePlans: string[] = [];
const madeUsers: string[] = [];
const madeSpots: string[] = [];

async function createPlan(): Promise<Plan> {
  const id = randomUUID();
  const spots = [randomUUID(), randomUUID(), randomUUID()];
  const hostToken = randomUUID() + randomUUID(); // > 32 chars, matches the RPC guard
  const hostHash = createHash("sha256").update(hostToken).digest("hex");

  const spotRows = spots
    .map((s, i) => `('${s}','QA023 spot ${i}','dinner','Dubai','Test','$$',100,'12am','test')`)
    .join(",");
  const planSpotRows = spots.map((s) => `('${id}','${s}',1,false)`).join(",");

  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ${spotRows};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person)
      values ('${id}','QA023 plan','dinner','Dubai',now() + interval '7 days','open','pool',1,200);
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${planSpotRows};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${hostHash}');
  `);

  madePlans.push(id);
  madeSpots.push(...spots);
  return { id, spots, hostToken };
}

// Post-020 a vote write needs an authenticated user that holds a plan_access
// row. On a LOCAL db we mint both directly; claim_plan_access would need a real
// GoTrue session we can't forge here.
async function mintParticipant(planId: string): Promise<Participant> {
  const uid = randomUUID();
  const hash = randomBytes(32).toString("hex"); // 64 hex chars, matches ^[0-9a-f]{64}$
  await psql(`
    insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into plan_access (plan_id, user_id) values ('${planId}','${uid}');
  `);
  madeUsers.push(uid);
  return { uid, hash };
}

// A session that auth.uid() resolves for, acting as the `authenticated` role so
// the EXECUTE grant is exercised too.
function authPrelude(p: Participant): string {
  return `set request.jwt.claims to '{"sub":"${p.uid}","role":"authenticated"}'; set role authenticated;`;
}

function castVoteSql(
  p: Participant,
  planId: string,
  spotId: string,
  value: boolean,
  phase: "pool" | "final" = "pool",
  pool = 1,
): string {
  return `${authPrelude(p)} select cast_plan_vote('${planId}','${spotId}','QA',${value},'${phase}',${pool}::smallint,'${p.hash}');`;
}

async function castVote(
  p: Participant,
  planId: string,
  spotId: string,
  value: boolean,
  phase: "pool" | "final" = "pool",
  pool = 1,
): Promise<any> {
  return JSON.parse(await psql(castVoteSql(p, planId, spotId, value, phase, pool)));
}

async function roundRowCount(planId: string, hash: string, phase = "pool", pool = 1): Promise<number> {
  return Number(
    await psql(
      `select count(*) from votes where plan_id='${planId}' and participant_token_hash='${hash}' and phase='${phase}' and pool_number=${pool}`,
    ),
  );
}

// The exact shape execute_plan_command uses to tally a pool round.
async function poolYesTotal(planId: string): Promise<number> {
  return Number(
    await psql(`
      select coalesce(sum(c),0) from (
        select count(v.id) filter (where v.value) as c
        from plan_spots ps
        left join votes v on v.plan_id = ps.plan_id and v.spot_id = ps.spot_id
          and v.phase = 'pool' and v.pool_number = ps.pool_number
        where ps.plan_id = '${planId}' and ps.pool_number = 1
        group by ps.spot_id
      ) t`),
  );
}

// execute_plan_command's `picked` CTE, verbatim, for one plan.
async function pickFinalist(planId: string): Promise<string> {
  return psql(`
    select spot_id from (
      select distinct on (ps.pool_number) ps.pool_number, ps.spot_id
      from plan_spots ps
      left join votes v on v.plan_id = ps.plan_id and v.spot_id = ps.spot_id
        and v.phase = 'pool' and v.pool_number = ps.pool_number
      where ps.plan_id = '${planId}'
      group by ps.pool_number, ps.spot_id
      order by ps.pool_number, count(v.id) filter (where v.value) desc, ps.spot_id
    ) x`);
}

after(async () => {
  if (SKIP) return;
  if (madePlans.length) await psql(`delete from plans where id in (${madePlans.map(q).join(",")})`);
  if (madeUsers.length) await psql(`delete from auth.users where id in (${madeUsers.map(q).join(",")})`);
  if (madeSpots.length) await psql(`delete from spots where id in (${madeSpots.map(q).join(",")})`);
});

// ── 1. idempotency ─────────────────────────────────────────────────────────

describe("migration 023 — cast_plan_vote idempotency", { skip: SKIP || undefined }, () => {
  test("calling twice with identical args is a no-op: identical jsonb, one row", async () => {
    const plan = await createPlan();
    const p = await mintParticipant(plan.id);

    const first = await castVote(p, plan.id, plan.spots[0], true);
    const second = await castVote(p, plan.id, plan.spots[0], true);

    assert.deepEqual(second, first, "retry returned a different payload");
    assert.equal(first.plan_id, plan.id);
    assert.equal(first.phase, "pool");
    assert.equal(first.pool_number, 1);
    assert.equal(first.spot_id, plan.spots[0]);
    assert.equal(await roundRowCount(plan.id, p.hash), 1, "retry inserted a second row");
  });

  test("switching the pick keeps it at one row, now pointing at the new spot", async () => {
    const plan = await createPlan();
    const p = await mintParticipant(plan.id);

    await castVote(p, plan.id, plan.spots[0], true);
    const switched = await castVote(p, plan.id, plan.spots[1], true);

    assert.equal(switched.spot_id, plan.spots[1]);
    assert.equal(await roundRowCount(plan.id, p.hash), 1, "switching the pick left two rows");
    assert.equal(
      await psql(
        `select spot_id from votes where plan_id='${plan.id}' and participant_token_hash='${p.hash}'`,
      ),
      plan.spots[1],
      "row still points at the old spot",
    );
  });

  test("p_value = false clears the pick: zero rows, spot_id null in the payload", async () => {
    const plan = await createPlan();
    const p = await mintParticipant(plan.id);

    await castVote(p, plan.id, plan.spots[0], true);
    const cleared = await castVote(p, plan.id, plan.spots[0], false);

    assert.equal(cleared.spot_id, null, "cleared vote should report spot_id null");
    assert.equal(cleared.plan_id, plan.id);
    assert.equal(await roundRowCount(plan.id, p.hash), 0, "clearing the pick left a row behind");
  });
});

// ── 2. concurrency: two spots, same participant, same round, fired parallel ──

describe("migration 023 — tally under a concurrent double-vote", { skip: SKIP || undefined }, () => {
  test("parallel casts on different spots leave one row and one YES in the tally", async (t) => {
    const plan = await createPlan();
    const p = await mintParticipant(plan.id);

    // Force a real interleave: call A holds its transaction (and the new
    // votes_participant_round_key row) open for a second; call B, fired right
    // after, must block on that key and then resolve as ON CONFLICT DO UPDATE.
    // Pre-023 (delete-then-insert, no unique index) B does not block and both
    // inserts land — two rows.
    const held = `${authPrelude(p)} begin; select cast_plan_vote('${plan.id}','${plan.spots[0]}','QA',true,'pool',1::smallint,'${p.hash}'); select pg_sleep(1); commit;`;
    const settled = await Promise.allSettled([
      psql(held),
      (async () => {
        await new Promise((r) => setTimeout(r, 200));
        return psql(castVoteSql(p, plan.id, plan.spots[1], true));
      })(),
    ]);

    const rejected = settled.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const r of rejected) {
      t.diagnostic(`one concurrent cast_plan_vote raised: ${String(r.reason.message).split("\n")[0]}`);
    }

    // The invariant. Pre-023 (delete-then-insert, no unique index) this is 2.
    assert.equal(
      await roundRowCount(plan.id, p.hash),
      1,
      "concurrent double-vote left more than one row for the participant/round",
    );

    // Tallied the execute_plan_command way: the participant contributes one YES,
    // not two. Pre-023 this sums to 2 and can decide a plan.
    assert.equal(
      await poolYesTotal(plan.id),
      1,
      "participant contributed more than one YES to the pool tally",
    );

    // The real host command still advances cleanly off that state.
    const advanced = JSON.parse(
      await psql(`${authPrelude(p)} select execute_plan_command('${plan.id}','${plan.hostToken}','advance');`),
    );
    assert.equal(advanced.plan.stage, "final", "execute_plan_command('advance') did not move to final");
    assert.equal(advanced.finalists.length, 1, "advance produced the wrong number of finalists");
  });
});

// ── 3. the tally is deterministic (unstable ORDER BY passes once, fails in prod)

describe("migration 023 — pool tally determinism", { skip: SKIP || undefined }, () => {
  test("a 1-1 tie resolves to the same finalist every run and regardless of vote order", async () => {
    const plan = await createPlan();
    const a = await mintParticipant(plan.id);
    const b = await mintParticipant(plan.id);

    await castVote(a, plan.id, plan.spots[0], true);
    await castVote(b, plan.id, plan.spots[1], true); // spot0 = 1 YES, spot1 = 1 YES

    const winner = await pickFinalist(plan.id);
    const expected = [plan.spots[0], plan.spots[1]].sort()[0];
    assert.equal(winner, expected, "tie is not broken by ascending spot_id as execute_plan_command documents");

    for (let i = 0; i < 20; i++) {
      assert.equal(await pickFinalist(plan.id), winner, "pick tally is not deterministic across repeated runs");
    }

    // Re-cast the same tie in the opposite order — result must not move.
    await castVote(a, plan.id, plan.spots[0], false);
    await castVote(b, plan.id, plan.spots[1], false);
    await castVote(b, plan.id, plan.spots[1], true);
    await castVote(a, plan.id, plan.spots[0], true);
    assert.equal(await pickFinalist(plan.id), winner, "pick tally depends on vote insertion order");
  });
});

// ── 4. grant posture (cheap regression catch for the revoke/grant lines) ────

describe("migration 023 — cast_plan_vote EXECUTE grant", { skip: SKIP || undefined }, () => {
  test("granted to authenticated, not to anon or PUBLIC", async () => {
    const acl = await psql(
      `select coalesce(array_to_string(proacl, ','), '<default:PUBLIC>') from pg_proc where proname = 'cast_plan_vote'`,
    );
    assert.match(acl, /authenticated=X/, `authenticated lacks EXECUTE (acl: ${acl})`);
    assert.doesNotMatch(acl, /(^|,)anon=X/, `anon still has EXECUTE (acl: ${acl})`);
    assert.doesNotMatch(acl, /(^|,)=X/, `PUBLIC still has EXECUTE (acl: ${acl})`);
    assert.notEqual(acl, "<default:PUBLIC>", "proacl is NULL — default grants EXECUTE to PUBLIC");
  });
});
