// Integration tests for migration 025 — the same double-write race migration
// 023 closed on votes, closed here on set_plan_rsvp and rate_plan.
//
// `select ... for update` locks an EXISTING row but locks nothing when the
// row doesn't exist yet, so two concurrent *first-time* calls for the same
// (plan_id, voter_name) can both see `existing.id is null` and race to
// INSERT. The table-level `unique (plan_id, voter_name)` constraint stopped
// bad data, but the losing call used to surface a raw, unhandled Postgres
// 23505 (unique_violation) instead of the function's own clean 42501 /
// retry-into-update path. 025's fix: loop, and on unique_violation from the
// INSERT, retry — the next iteration re-selects, now finds the concurrently
// inserted row, and takes the UPDATE branch.
//
// These run against a REAL Postgres (the auth schema, auth.uid(), the
// plan_access-membership trigger, and the security-definer RPCs). A mocked
// Postgres proves nothing about a unique-index race, so there is no mock
// here on purpose.
//
// Not picked up by `npm test` (glob is tests/*.test.ts) — run with `npm run
// test:db`. Skips itself, loudly, when no database is reachable or migration
// 025 is not applied. See tests/README.md for the infra it needs.
//
// NEVER point TEST_DATABASE_URL at the live project: schema.sql DROPs all
// tables and these tests write throwaway rows.

import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";

const execFileAsync = promisify(execFile);

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const withStd = err as { stderr?: unknown; message?: unknown };
    return String(withStd.stderr ?? withStd.message ?? err).trim();
  }
  return String(err instanceof Error ? err.message : err).trim();
}

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Each psql invocation is its own OS process = its own Postgres backend,
// which is exactly what the concurrency tests need (two real parallel
// connections).
async function psql(sql: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "psql",
      [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 },
    );
    return stdout.trim();
  } catch (err: unknown) {
    throw new Error(errorMessage(err));
  }
}

const q = (s: string) => `'${s}'`;

async function detectSkip(): Promise<string | false> {
  try {
    await psql("select 1");
  } catch (err: unknown) {
    return `no reachable Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL Supabase (never the live project). ${errorMessage(err).split("\n")[0]}`;
  }
  try {
    await psql("select auth.uid()");
  } catch {
    return "auth.uid() is missing — this DB is not a Supabase instance. Load supabase/schema.sql via `supabase start`.";
  }
  for (const [sig, label] of [
    ["public.set_plan_rsvp(uuid,text,boolean,text,text)", "set_plan_rsvp"],
    ["public.rate_plan(uuid,uuid,text,integer,boolean,text)", "rate_plan"],
  ] as const) {
    let ret: string;
    try {
      ret = await psql(`select pg_get_function_result('${sig}'::regprocedure)`);
    } catch {
      return `${label}(${sig}) not found — migrations not applied`;
    }
    if (ret !== "void") {
      return `${label} returns '${ret}', expected 'void' — signature drifted`;
    }
    const body = await psql(`select pg_get_functiondef('${sig}'::regprocedure)`);
    if (!body.includes("unique_violation")) {
      return `${label} has no unique_violation retry loop — migration 025 not applied`;
    }
  }
  return false;
}

const SKIP = await detectSkip();

// ── fixtures ───────────────────────────────────────────────────────────────

type Participant = { uid: string; hash: string };

const madePlans: string[] = [];
const madeUsers: string[] = [];
const madeSpots: string[] = [];

// set_plan_rsvp only requires the plan to exist (open or decided).
async function createOpenPlan(): Promise<string> {
  const id = randomUUID();
  await psql(`
    insert into plans (id, title, category, area, status)
      values ('${id}', 'QA025 plan', 'dinner', 'Dubai', 'open');
  `);
  madePlans.push(id);
  return id;
}

// rate_plan requires a decided plan with a winner_spot_id equal to the spot
// being rated. Driving execute_plan_command's full pool→final→decide flow
// isn't needed to exercise the race — the function only reads plans.status
// and plans.winner_spot_id — so the fixture sets them directly.
async function createDecidedPlan(): Promise<{ planId: string; spotId: string }> {
  const planId = randomUUID();
  const spotId = randomUUID();
  await psql(`
    insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe)
      values ('${spotId}', 'QA025 spot', 'dinner', 'Dubai', 'Test', '$$', 100, '12am', 'test');
    insert into plans (id, title, category, area, status, stage, winner_spot_id)
      values ('${planId}', 'QA025 plan', 'dinner', 'Dubai', 'decided', 'decided', '${spotId}');
  `);
  madePlans.push(planId);
  madeSpots.push(spotId);
  return { planId, spotId };
}

// Post-020 a write needs an authenticated user that holds a plan_access row.
// On a LOCAL db we mint both directly; claim_plan_access would need a real
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

// A session that auth.uid() resolves for, acting as the `authenticated` role
// so the EXECUTE grant is exercised too.
function authPrelude(p: Participant): string {
  return `set request.jwt.claims to '{"sub":"${p.uid}","role":"authenticated"}'; set role authenticated;`;
}

function rsvpCall(p: Participant, planId: string, coming: boolean, choice: "coming" | "maybe" | "no"): string {
  return `select set_plan_rsvp('${planId}','QA',${coming},'${choice}','${p.hash}');`;
}

function rateCall(p: Participant, planId: string, spotId: string, stars: number, again: boolean): string {
  return `select rate_plan('${planId}','${spotId}','QA',${stars},${again},'${p.hash}');`;
}

function rsvpSql(p: Participant, planId: string, coming: boolean, choice: "coming" | "maybe" | "no"): string {
  return `${authPrelude(p)} ${rsvpCall(p, planId, coming, choice)}`;
}

function rateSql(p: Participant, planId: string, spotId: string, stars: number, again: boolean): string {
  return `${authPrelude(p)} ${rateCall(p, planId, spotId, stars, again)}`;
}

// The "held" side of a race: the call runs inside an explicit transaction
// that sleeps for a second AFTER the insert but BEFORE commit, so the row it
// just inserted stays uncommitted (and therefore invisible to the
// challenger's own SELECT) for that whole window.
function held(p: Participant, call: string): string {
  return `${authPrelude(p)} begin; ${call} select pg_sleep(1); commit;`;
}

function challenger(p: Participant, call: string): string {
  return `${authPrelude(p)} ${call}`;
}

async function rsvpRowCount(planId: string, voterName = "QA"): Promise<number> {
  return Number(
    await psql(`select count(*) from rsvps where plan_id='${planId}' and voter_name='${voterName}'`),
  );
}

async function rsvpRow(
  planId: string,
  voterName = "QA",
): Promise<{ coming: boolean; choice: string; hash: string } | null> {
  const raw = await psql(
    `select coming::text || '|' || choice || '|' || participant_token_hash from rsvps where plan_id='${planId}' and voter_name='${voterName}'`,
  );
  if (raw === "") return null;
  const [comingStr, choice, hash] = raw.split("|");
  return { coming: comingStr === "true", choice, hash };
}

async function ratingRowCount(planId: string, voterName = "QA"): Promise<number> {
  return Number(
    await psql(`select count(*) from ratings where plan_id='${planId}' and voter_name='${voterName}'`),
  );
}

async function ratingRow(
  planId: string,
  voterName = "QA",
): Promise<{ stars: number; again: boolean; hash: string } | null> {
  const raw = await psql(
    `select stars::text || '|' || again::text || '|' || participant_token_hash from ratings where plan_id='${planId}' and voter_name='${voterName}'`,
  );
  if (raw === "") return null;
  const [starsStr, againStr, hash] = raw.split("|");
  return { stars: Number(starsStr), again: againStr === "true", hash };
}

// Forces the real interleave that 025 fixes: A's call holds its transaction
// (and the row it just inserted) open for a second inside an explicit
// begin/commit (built by `held`); B, fired 200ms later, races A's
// uncommitted insert — B's own SELECT sees no row yet (A hasn't committed),
// so B also attempts an INSERT, which Postgres blocks until A commits, then
// B gets a real 23505. B's exception handler catches it and loops back into
// the UPDATE branch, now seeing A's just-committed row. Pre-025 (no retry
// loop) B's call would raise that 23505 straight to the caller instead.
async function raceFirstTimeCalls(
  heldSql: string,
  challengerSql: string,
): Promise<[PromiseSettledResult<string>, PromiseSettledResult<string>]> {
  const [a, b] = await Promise.allSettled([
    psql(heldSql),
    (async () => {
      await new Promise((r) => setTimeout(r, 200));
      return psql(challengerSql);
    })(),
  ]);
  return [a, b];
}

after(async () => {
  if (SKIP) return;
  if (madePlans.length) await psql(`delete from plans where id in (${madePlans.map(q).join(",")})`);
  if (madeUsers.length) await psql(`delete from auth.users where id in (${madeUsers.map(q).join(",")})`);
  if (madeSpots.length) await psql(`delete from spots where id in (${madeSpots.map(q).join(",")})`);
});

// ── set_plan_rsvp ────────────────────────────────────────────────────────

describe("migration 025 — set_plan_rsvp upsert race", { skip: SKIP || undefined }, () => {
  test("non-concurrent: first call inserts, second (same voter, same token) updates in place", async () => {
    const planId = await createOpenPlan();
    const p = await mintParticipant(planId);

    await psql(rsvpSql(p, planId, true, "coming"));
    assert.equal(await rsvpRowCount(planId), 1, "first call did not insert");

    await psql(rsvpSql(p, planId, false, "no"));
    assert.equal(await rsvpRowCount(planId), 1, "second call inserted a duplicate instead of updating");
    const row = await rsvpRow(planId);
    assert.equal(row?.coming, false, "update did not take effect");
    assert.equal(row?.choice, "no", "update did not take effect");
  });

  test("concurrent first-time calls, DIFFERENT tokens: one wins, the other gets the clean 42501 — never a raw unique_violation", async (t) => {
    const planId = await createOpenPlan();
    const a = await mintParticipant(planId);
    const b = await mintParticipant(planId);

    const [ra, rb] = await raceFirstTimeCalls(
      held(a, rsvpCall(a, planId, true, "coming")),
      challenger(b, rsvpCall(b, planId, false, "no")),
    );

    for (const r of [ra, rb]) {
      if (r.status === "rejected") {
        t.diagnostic(`one concurrent set_plan_rsvp raised: ${errorMessage(r.reason).split("\n")[0]}`);
      }
    }

    // Exactly one of the two calls must fail, and only with the function's
    // own clean 42501, never a raw duplicate-key error.
    const outcomes = [ra, rb];
    const rejected = outcomes.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(rejected.length, 1, "expected exactly one call to lose the race for this name");
    const loserMessage = errorMessage(rejected[0].reason);
    assert.match(loserMessage, /already in use/i, "loser did not get the function's clean ownership error");
    assert.doesNotMatch(
      loserMessage,
      /duplicate key|unique constraint|23505|unique_violation/i,
      "an unhandled Postgres unique_violation leaked to the caller — the 025 retry loop did not catch it",
    );

    assert.equal(await rsvpRowCount(planId), 1, "concurrent different-token calls left more than one row");
    const row = await rsvpRow(planId);
    assert.equal(row?.hash, a.hash, "the row does not belong to the actual insert winner (A, held open)");
    assert.equal(row?.coming, true, "the winner's own values were not the ones persisted");
    assert.equal(row?.choice, "coming", "the winner's own values were not the ones persisted");
  });

  test("concurrent first-time calls, SAME token (client retry): both succeed, one row, no unhandled exception", async () => {
    const planId = await createOpenPlan();
    const p = await mintParticipant(planId);

    const [ra, rb] = await raceFirstTimeCalls(
      held(p, rsvpCall(p, planId, true, "coming")),
      challenger(p, rsvpCall(p, planId, false, "maybe")),
    );

    assert.equal(ra.status, "fulfilled", `held call raised: ${ra.status === "rejected" ? errorMessage(ra.reason) : ""}`);
    assert.equal(
      rb.status,
      "fulfilled",
      `challenger call raised: ${rb.status === "rejected" ? errorMessage(rb.reason) : ""}`,
    );

    assert.equal(await rsvpRowCount(planId), 1, "same-token race left more than one row");
    const row = await rsvpRow(planId);
    // B is the one that raced into the retry-into-update branch, so its
    // values are what land.
    assert.equal(row?.choice, "maybe", "retry-into-update branch did not apply the second call's values");
  });
});

// ── rate_plan ────────────────────────────────────────────────────────────

describe("migration 025 — rate_plan upsert race", { skip: SKIP || undefined }, () => {
  test("non-concurrent: first call inserts, second (same voter, same token) updates in place", async () => {
    const { planId, spotId } = await createDecidedPlan();
    const p = await mintParticipant(planId);

    await psql(rateSql(p, planId, spotId, 5, true));
    assert.equal(await ratingRowCount(planId), 1, "first call did not insert");

    await psql(rateSql(p, planId, spotId, 2, false));
    assert.equal(await ratingRowCount(planId), 1, "second call inserted a duplicate instead of updating");
    const row = await ratingRow(planId);
    assert.equal(row?.stars, 2, "update did not take effect");
    assert.equal(row?.again, false, "update did not take effect");
  });

  test("concurrent first-time calls, DIFFERENT tokens: one wins, the other gets the clean 42501 — never a raw unique_violation", async (t) => {
    const { planId, spotId } = await createDecidedPlan();
    const a = await mintParticipant(planId);
    const b = await mintParticipant(planId);

    const [ra, rb] = await raceFirstTimeCalls(
      held(a, rateCall(a, planId, spotId, 5, true)),
      challenger(b, rateCall(b, planId, spotId, 1, false)),
    );

    for (const r of [ra, rb]) {
      if (r.status === "rejected") {
        t.diagnostic(`one concurrent rate_plan raised: ${errorMessage(r.reason).split("\n")[0]}`);
      }
    }

    const outcomes = [ra, rb];
    const rejected = outcomes.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(rejected.length, 1, "expected exactly one call to lose the race for this name");
    const loserMessage = errorMessage(rejected[0].reason);
    assert.match(loserMessage, /already in use/i, "loser did not get the function's clean ownership error");
    assert.doesNotMatch(
      loserMessage,
      /duplicate key|unique constraint|23505|unique_violation/i,
      "an unhandled Postgres unique_violation leaked to the caller — the 025 retry loop did not catch it",
    );

    assert.equal(await ratingRowCount(planId), 1, "concurrent different-token calls left more than one row");
    const row = await ratingRow(planId);
    assert.equal(row?.hash, a.hash, "the row does not belong to the actual insert winner (A, held open)");
    assert.equal(row?.stars, 5, "the winner's own values were not the ones persisted");
    assert.equal(row?.again, true, "the winner's own values were not the ones persisted");
  });

  test("concurrent first-time calls, SAME token (client retry): both succeed, one row, no unhandled exception", async () => {
    const { planId, spotId } = await createDecidedPlan();
    const p = await mintParticipant(planId);

    const [ra, rb] = await raceFirstTimeCalls(
      held(p, rateCall(p, planId, spotId, 5, true)),
      challenger(p, rateCall(p, planId, spotId, 3, false)),
    );

    assert.equal(ra.status, "fulfilled", `held call raised: ${ra.status === "rejected" ? errorMessage(ra.reason) : ""}`);
    assert.equal(
      rb.status,
      "fulfilled",
      `challenger call raised: ${rb.status === "rejected" ? errorMessage(rb.reason) : ""}`,
    );

    assert.equal(await ratingRowCount(planId), 1, "same-token race left more than one row");
    const row = await ratingRow(planId);
    assert.equal(row?.stars, 3, "retry-into-update branch did not apply the second call's values");
  });
});
