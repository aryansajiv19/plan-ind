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

/** A permanent account; `born` null means no member_ages row. */
async function user(born: string | null = "1990-01-01"): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
    values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    ${born ? `insert into member_ages (user_id, date_of_birth) values ('${uid}', '${born}');` : ""}`);
  made.users.push(uid);
  return uid;
}
const yearsAgo = (n: number) => new Date(Date.now() - (n * 365.25 + 2) * 864e5).toISOString().slice(0, 10);

type Plan = { id: string; token: string; pools: string[][] };
/** pools[i] holds the spot ids dealt into round i+1; `prefix` fixes a spot id's first block. */
async function plan(o: {
  creator?: string | null; pools?: number; category?: string; deadline?: string | null;
  spotAge?: number; prefixes?: string[];
} = {}): Promise<Plan> {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const n = o.pools ?? 1;
  const pools = Array.from({ length: n }, (_, i) =>
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
    assert.equal(await as(holder, `select am_plan_host('${p.id}')`), "f");
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
});

// ── R7: one name, one member ────────────────────────────────────────────────
describe("067 voter names (R7)", { skip: SKIP }, () => {
  test("a second account cannot vote under a name another member uses", async () => {
    const p = await plan({ creator: await user() });
    const [a, b] = [await user(), await user()];
    for (const u of [a, b]) await join(p.id, u);
    await vote(a, p.id, p.pools[0][0], "Sam", hash());
    await assert.rejects(vote(b, p.id, p.pools[0][1], "Sam", hash()), /That participant name is already in use/);
    assert.equal(await psql(`select count(*) from votes where plan_id='${p.id}'`), "1");
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
});
