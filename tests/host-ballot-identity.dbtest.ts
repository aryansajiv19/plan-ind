// Migration 067 — host and ballot identity. One describe per rule; each fails
// against the pre-067 functions (run it on a schema.sql from before 067 to
// see), which is the point: there is deliberately no "067 applied?" skip gate.
// Everything it creates is swept in `after`. NEVER point TEST_DATABASE_URL at
// the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function psql(sql: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "psql",
      [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 },
    );
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(String(e.stderr ?? e.message ?? err).trim());
  }
}

const SKIP = await psql("select auth.uid()").then(
  () => false as const,
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL stack (never the live project)`,
);

// ── fixtures ───────────────────────────────────────────────────────────────
const made = { plans: [] as string[], spots: [] as string[], users: [] as string[] };
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hash = () => randomBytes(32).toString("hex");

/** A permanent account; `born` null means no member_ages row; `name` adds a people profile. */
async function user(born: string | null = "1990-01-01", name?: string): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
    values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    ${born ? `insert into member_ages (user_id, date_of_birth) values ('${uid}', '${born}');` : ""}
    ${name ? `insert into people (id, display_name, auth_user_id) values ('${uid}', '${name}', '${uid}');` : ""}`);
  made.users.push(uid);
  return uid;
}
const yearsAgo = (n: number) => new Date(Date.now() - (n * 365.25 + 2) * 864e5).toISOString().slice(0, 10);

type Plan = { id: string; token: string; pools: string[][] };
/** pools[i] holds the spot ids dealt into round i+1; `prefix` fixes a spot id's first block. */
async function plan(o: {
  creator?: string | null; pools?: number; category?: string; deadline?: string | null;
  spotAge?: number; prefixes?: string[]; id?: string; spots?: string[];
} = {}): Promise<Plan> {
  const id = o.id ?? randomUUID();
  const token = randomBytes(32).toString("hex");
  const n = o.pools ?? 1;
  const pools = o.spots ? [o.spots] : Array.from({ length: n }, (_, i) =>
    [0, 1, 2].map((j) => (j === 0 && o.prefixes?.[i] ? `${o.prefixes[i]}-${randomUUID().slice(9)}` : randomUUID())));
  const spots = pools.flat();
  const deadline = o.deadline === null ? "null" : o.deadline ?? "now() + interval '7 days'";
  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,minimum_age)
      values ${spots.map((s, i) => `('${s}','QA067 spot ${i}','dinner','Dubai','Test','$$',100,'12am','test',${o.spotAge ?? 0})`).join(",")};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA067 plan','${o.category ?? "dinner"}','Dubai',${deadline},'open','pool',${n},200,
              ${o.creator ? `'${o.creator}'` : "null"});
    insert into plan_spots (plan_id,spot_id,pool_number,advanced)
      values ${pools.flatMap((p, i) => p.map((s) => `('${id}','${s}',${i + 1},false)`)).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${sha256(token)}');`);
  made.plans.push(id);
  made.spots.push(...spots);
  return { id, token, pools };
}
const join = (planId: string, uid: string) => psql(`insert into plan_access (plan_id,user_id) values ('${planId}','${uid}')`);

/** Run `sql` as `uid` (permanent, authenticated role). */
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);

const command = (uid: string, planId: string, token: string | null, cmd: string, patch = "{}") =>
  as(uid, `select execute_plan_command('${planId}', ${token ? `'${token}'` : "null"}, '${cmd}', '${patch}'::jsonb)`);
const vote = (uid: string, planId: string, spot: string, name: string, h: string, phase = "pool", pool = 1) =>
  as(uid, `select cast_plan_vote('${planId}','${spot}','${name}',true,'${phase}',${pool}::smallint,'${h}')`);
const rsvp = (uid: string, planId: string, name: string, h: string) =>
  as(uid, `select set_plan_rsvp('${planId}','${name}',true,'coming','${h}')`);

after(async () => {
  if (SKIP) return;
  if (made.plans.length) await psql(`delete from plans where id in (${made.plans.map((p) => `'${p}'`).join(",")})`);
  if (made.spots.length) await psql(`delete from spots where id in (${made.spots.map((s) => `'${s}'`).join(",")})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${made.users.map((u) => `'${u}'`).join(",")})`);
});

// ── B7 + R14: one host rule ──────────────────────────────────────────────────
describe("067 host rule (B7, R14)", { skip: SKIP }, () => {
  test("the creator runs host commands on any device, with no token", async () => {
    const host = await user();
    const p = await plan({ creator: host });
    const out = JSON.parse(await command(host, p.id, null, "patch", '{"booked": true}'));
    assert.equal(out.plan.booked, true);
    assert.equal(JSON.parse(await as(host, `select edit_plan('${p.id}', null, 'Renamed', null)`)).result, "edited");
    assert.equal(await as(host, `select am_plan_host('${p.id}')`), "t");
  });

  test("another account holding the leftover token is not the host", async () => {
    const host = await user();
    const other = await user();
    const p = await plan({ creator: host });
    await assert.rejects(command(other, p.id, p.token, "patch", '{"booked": true}'), /Host authorization required/);
    assert.equal(JSON.parse(await as(other, `select delete_plan('${p.id}', '${p.token}')`)).result, "not_host");
    assert.equal(await as(other, `select am_plan_host('${p.id}')`), "f");
  });

  test("a legacy plan with no creator still takes its token, and only the right one", async () => {
    const holder = await user();
    const p = await plan({ creator: null });
    const out = JSON.parse(await command(holder, p.id, p.token, "patch", '{"booked": true}'));
    assert.equal(out.plan.booked, true);
    await assert.rejects(command(holder, p.id, hash(), "patch", '{"booked": false}'), /Host authorization required/);
    // NULL, not false: the page then falls back to the token it holds (F6).
    assert.equal(await as(holder, `select coalesce(am_plan_host('${p.id}')::text, 'null')`), "null");
  });
});

// ── R1: the final round is real, and the uuid never picks the winner ────────
describe("067 rounds (R1)", { skip: SKIP }, () => {
  test("advance gives the final round at least an hour; no deadline stays none", async () => {
    const host = await user();
    const soon = await plan({ creator: host, deadline: "now() + interval '1 minute'" });
    await command(host, soon.id, soon.token, "advance");
    assert.equal(await psql(`select deadline > now() + interval '55 minutes' from plans where id='${soon.id}'`), "t");
    const open = await plan({ creator: host, deadline: null });
    await command(host, open.id, open.token, "advance");
    assert.equal(await psql(`select deadline is null from plans where id='${open.id}'`), "t");
  });

  test("with no final votes the pool-round favourite wins, not the lowest uuid", async () => {
    const host = await user();
    // Round 1's pick has the HIGHEST possible uuid prefix and two yes votes;
    // round 2's pick the lowest and one. Pre-067 the lowest uuid won.
    const p = await plan({ creator: host, pools: 2, prefixes: ["ffffffff", "00000000"] });
    const [a, b] = [await user(), await user()];
    for (const u of [a, b]) await join(p.id, u);
    await vote(a, p.id, p.pools[0][0], "QA-a", hash(), "pool", 1);
    await vote(b, p.id, p.pools[0][0], "QA-b", hash(), "pool", 1);
    await vote(a, p.id, p.pools[1][0], "QA-a", hash(), "pool", 2);
    await command(host, p.id, p.token, "advance");
    const out = JSON.parse(await command(host, p.id, p.token, "decide"));
    assert.equal(out.winner_spot_id, p.pools[0][0]);
  });

  test("advance breaks a zero-vote pool by a per-plan hash, not the lowest uuid (F4)", async () => {
    const host = await user();
    const spots = [randomUUID(), randomUUID(), randomUUID()];
    const lowest = [...spots].sort()[0];
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    // A plan id for which the hash does not also pick the lowest uuid, so the
    // pre-067 order (spot_id) and this one give different answers.
    let id = randomUUID();
    const hashPick = (planId: string) => [...spots].sort((a, b) => (md5(planId + a) < md5(planId + b) ? -1 : 1))[0];
    while (hashPick(id) === lowest) id = randomUUID();
    const p = await plan({ creator: host, id, spots });
    const out = JSON.parse(await command(host, p.id, p.token, "advance"));
    assert.deepEqual(out.finalists, [hashPick(id)]);
    assert.notEqual(out.finalists[0], lowest);
  });

  test("a repeated advance or decide returns the plan instead of failing (F5)", async () => {
    const host = await user();
    const p = await plan({ creator: host });
    const first = JSON.parse(await command(host, p.id, p.token, "advance"));
    const again = JSON.parse(await command(host, p.id, p.token, "advance"));
    assert.equal(again.plan.stage, "final");
    assert.deepEqual(again.finalists, first.finalists);
    const decided = JSON.parse(await command(host, p.id, p.token, "decide"));
    const decidedAgain = JSON.parse(await command(host, p.id, p.token, "decide"));
    assert.equal(decidedAgain.plan.status, "decided");
    assert.equal(decidedAgain.winner_spot_id, decided.winner_spot_id);
    // A wrong state is still an error: decide on a plan still in its pool round.
    const fresh = await plan({ creator: host });
    await assert.rejects(command(host, fresh.id, fresh.token, "decide"), /not ready to decide/);
  });
});

// ── F2 (and R7): identity is the account; a name is only a label ─────────────
describe("067 voter names are labels (R7, F2)", { skip: SKIP }, () => {
  test("two accounts may share a name, and each keeps its own ballot", async () => {
    const p = await plan({ creator: await user() });
    const [a, b] = [await user(), await user()];
    for (const u of [a, b]) await join(p.id, u);
    await vote(a, p.id, p.pools[0][0], "Sam", hash());
    await vote(b, p.id, p.pools[0][1], "Sam", hash());
    assert.equal(await psql(`select count(distinct user_id) from votes where plan_id='${p.id}' and voter_name='Sam'`), "2");
  });

  test("B renames to 'Alice', votes, renames back: the real Alice still votes, replies and rates", async () => {
    const host = await user();
    const p = await plan({ creator: host });
    const alice = await user("1990-01-01", "Alice");
    const bob = await user("1990-01-01", "Bob");
    for (const u of [alice, bob]) await join(p.id, u);
    const rename = (uid: string, name: string) => as(uid, `update people set display_name = '${name}' where id = '${uid}'`);
    await rename(bob, "Alice");
    await vote(bob, p.id, p.pools[0][0], "Alice", hash());
    await rename(bob, "Bob");
    await vote(alice, p.id, p.pools[0][1], "Alice", hash());
    await rsvp(alice, p.id, "Alice", hash());
    await command(host, p.id, p.token, "advance");
    const finalist = await psql(`select spot_id from plan_spots where plan_id='${p.id}' and advanced`);
    await vote(alice, p.id, finalist, "Alice", hash(), "final", 0);
    const { winner_spot_id: w } = JSON.parse(await command(host, p.id, p.token, "decide"));
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${p.id}'`); // 069 P11
    await as(alice, `select rate_plan('${p.id}','${w}','Alice',5,true,'${hash()}')`);
    const hers = await psql(`select
      (select count(*) from votes where plan_id='${p.id}' and user_id='${alice}') || ',' ||
      (select count(*) from rsvps where plan_id='${p.id}' and user_id='${alice}') || ',' ||
      (select count(*) from ratings where plan_id='${p.id}' and user_id='${alice}')`);
    assert.equal(hers, "2,1,1");
  });

  test("my_plan_rows returns only the caller's rows, and refuses a non-member", async () => {
    const p = await plan({ creator: await user() });
    const [a, b, outsider] = [await user(), await user(), await user()];
    for (const u of [a, b]) await join(p.id, u);
    await vote(a, p.id, p.pools[0][0], "QA-a", hash());
    await rsvp(a, p.id, "QA-a", hash());
    await vote(b, p.id, p.pools[0][1], "QA-b", hash());
    const mine = JSON.parse(await as(a, `select my_plan_rows('${p.id}')`));
    const aVote = await psql(`select id from votes where plan_id='${p.id}' and user_id='${a}'`);
    const aRsvp = await psql(`select id from rsvps where plan_id='${p.id}' and user_id='${a}'`);
    assert.deepEqual(mine.votes, [{ id: aVote, phase: "pool", pool_number: 1, spot_id: p.pools[0][0] }]);
    assert.equal(mine.rsvp_id, aRsvp);
    assert.equal(mine.rating_id, null);
    const theirs = JSON.parse(await as(b, `select my_plan_rows('${p.id}')`));
    assert.equal(theirs.votes.length, 1);
    assert.equal(theirs.rsvp_id, null);
    await assert.rejects(as(outsider, `select my_plan_rows('${p.id}')`), /Plan access required/);
  });
});

// ── R2/R13: a readable hash cannot lock anyone out ───────────────────────────
describe("067 participant hashes (R2, R13)", { skip: SKIP }, () => {
  test("B reusing A's hash in votes, rsvps and ratings leaves A free to write her own rows", async () => {
    const host = await user();
    const p = await plan({ creator: host, pools: 2 });
    const [a, b] = [await user(), await user()];
    for (const u of [a, b]) await join(p.id, u);
    const hA = hash();
    await vote(a, p.id, p.pools[0][0], "QA-a", hA, "pool", 1);
    await rsvp(b, p.id, "QA-b", hA);
    await rsvp(a, p.id, "QA-a", hA);
    await vote(b, p.id, p.pools[1][0], "QA-b", hA, "pool", 2);
    await vote(a, p.id, p.pools[1][1], "QA-a", hA, "pool", 2);
    await command(host, p.id, p.token, "advance");
    await vote(a, p.id, p.pools[0][0], "QA-a", hA, "final", 0);
    const { winner_spot_id: w } = JSON.parse(await command(host, p.id, p.token, "decide"));
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${p.id}'`); // 069 P11
    await as(b, `select rate_plan('${p.id}','${w}','QA-b',4,true,'${hA}')`);
    await as(a, `select rate_plan('${p.id}','${w}','QA-a',5,true,'${hA}')`);
    const mine = await psql(`select
      (select count(*) from votes where plan_id='${p.id}' and user_id='${a}') || ',' ||
      (select count(*) from rsvps where plan_id='${p.id}' and user_id='${a}') || ',' ||
      (select stars from ratings where plan_id='${p.id}' and user_id='${a}')`);
    assert.equal(mine, "3,1,5");
  });
});

// ── R8: booking_owner is cleaned like every other shown text ────────────────
describe("067 booking_owner (R8)", { skip: SKIP }, () => {
  test("bidi overrides and control characters are stripped", async () => {
    const host = await user();
    const p = await plan({ creator: host });
    const dirty = JSON.stringify({ booking_owner: "Sam‮\u0007 x" }).replace(/'/g, "''");
    await command(host, p.id, p.token, "patch", dirty);
    assert.equal(await psql(`select booking_owner from plans where id='${p.id}'`), "Sam x");
  });
});

// ── R6: joining meets the plan's age gate ────────────────────────────────────
describe("067 joining is age-gated (R6)", { skip: SKIP }, () => {
  const claim = (uid: string, planId: string) => as(uid, `select claim_plan_access('${planId}')`);

  test("an 18-year-old is refused a 21+ plan with the exact message; a 30-year-old joins", async () => {
    const p = await plan({ creator: await user(), category: "nightlife" });
    await assert.rejects(claim(await user(yearsAgo(18)), p.id), /This plan is for ages 21 and up\./);
    assert.equal(await claim(await user(yearsAgo(30)), p.id), "t");
  });

  test("a dealt spot's own minimum age counts too", async () => {
    const p = await plan({ creator: await user(), category: "dinner", spotAge: 18 });
    await assert.rejects(claim(await user(yearsAgo(16)), p.id), /This plan is for ages 18 and up\./);
  });

  test("no date of birth on file is refused with its own message", async () => {
    const p = await plan({ creator: await user() });
    await assert.rejects(claim(await user(null), p.id), /Add your date of birth to join this plan\./);
  });

  test("an ungated category is unaffected: a 13-year-old joins a dinner plan", async () => {
    const p = await plan({ creator: await user(), category: "dinner" });
    assert.equal(await claim(await user(yearsAgo(13)), p.id), "t");
  });

  test("applying 067 removes existing access that fails the gate, and keeps the rest (F3)", async () => {
    const creator = await user(null); // the creator keeps access even with no date of birth
    const p = await plan({ creator, category: "nightlife" });
    const [young, undated, adult] = [await user(yearsAgo(18)), await user(null), await user(yearsAgo(30))];
    for (const u of [creator, young, undated, adult]) await join(p.id, u);
    // The migration file itself, in a transaction that is rolled back: its
    // cleanup is global, and other dbtest files run beside this one.
    const migration = fileURLToPath(new URL("../supabase/migration-067-host-and-ballot-identity.sql", import.meta.url));
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-c", "begin", "-f", migration,
      "-c", `select string_agg(user_id::text, ',' order by user_id) from plan_access where plan_id = '${p.id}'`,
      "-c", "rollback"], { timeout: 30000 });
    const kept = stdout.trim().split("\n").filter(Boolean).pop();
    assert.equal(kept, [creator, adult].sort().join(","));
  });
});
