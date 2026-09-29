// Integration tests for migration 088 (crew match, crew streak) against a
// local Supabase Postgres with 085 and 088 applied.
// NEVER point TEST_DATABASE_URL at the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

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

const SKIP = await psql("select to_regprocedure('public.crew_match(uuid)') is not null").then(
  (out) => out === "t" ? false as const : "crew_match() is missing: apply migration 088 to this LOCAL database",
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[], plans: [] as string[] };

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA088', '${uid}');`);
  made.users.push(uid);
  return uid;
}
const befriend = (a: string, b: string) =>
  psql(`insert into friendships (person_id, friend_id) values ('${a}','${b}') on conflict do nothing;
    insert into friendships (person_id, friend_id) values ('${b}','${a}') on conflict do nothing;`);
async function place(category: string): Promise<string> {
  const id = randomUUID();
  await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source)
    values ('${id}','QA088 ${category}','${category}','Jumeirah','Test','$$',100,'11pm','QA','curated')`);
  made.spots.push(id);
  return id;
}
/** A plan both are in; `when` sets its outing time (for the streak). */
async function plan(members: string[], category = "dinner", when = "now() - interval '1 day'"): Promise<string> {
  const id = randomUUID();
  await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id,decided_at,event_time)
      values ('${id}','QA088','${category}','Dubai','decided','decided',1,'${members[0]}', ${when}, ${when});
    insert into plan_access (plan_id,user_id) values ${members.map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  return id;
}
/** Fixture rows; the membership trigger wants a session, which setup has none of. */
const vote = (uid: string, planId: string, spot: string, round: number) =>
  psql(`set session_replication_role = replica;
    insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, user_id) values ('${planId}','${spot}','QA',true,'pool',${round},'${uid}')`);
const ranked = (uid: string, spot: string, bucket: "loved" | "fine" | "meh") =>
  psql(`insert into place_rankings (person_id, spot_id, bucket, position, score) values ('${uid}','${spot}','${bucket}',1,5)`);
const visited = (uid: string, spot: string, planId: string | null = null) =>
  psql(`insert into visits (person_id, spot_id, plan_id) values ('${uid}','${spot}', ${planId ? `'${planId}'` : "null"})`);
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
const match = async (me: string, friend: string) => JSON.parse(await as(me, `select crew_match('${friend}')`));
const streak = async (me: string, friend: string) => JSON.parse(await as(me, `select crew_streak('${friend}')`));

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("088 who may ask", { skip: SKIP }, () => {
  test("only about a friend; a stranger, a guest and anon are refused, a friend is answered", async () => {
    const [me, friend, stranger] = [await user(), await user(), await user()];
    await befriend(me, friend);
    assert.equal((await match(me, friend)).status, "not_enough", "positive control: a friend gets an answer");
    assert.equal(typeof (await streak(me, friend)).months, "number");
    await assert.rejects(() => match(me, stranger), /Only for your friends/);
    await assert.rejects(() => streak(me, stranger), /Only for your friends/);
    await assert.rejects(() => match(me, me), /Only for your friends/);
    await assert.rejects(() => as(me, `select crew_match('${friend}')`, true), /Sign in/);
    await assert.rejects(() => psql(`set role anon; select crew_match('${friend}')`), /permission denied/);
    await assert.rejects(() => as(me, `select crew_friend_account('${friend}')`), /permission denied/);
    for (const sql of ["select * from crew_rank_snapshots", `delete from crew_rank_snapshots`,
      `insert into crew_rank_snapshots (person_a, person_b, day, places) values ('${me}','${friend}', current_date, 0)`]) {
      await assert.rejects(() => as(me, sql), /permission denied/, sql);
    }
  });
});

describe("088 crew match", { skip: SKIP }, () => {
  test("under three shared signals it's not enough yet, never a thin percentage", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    const p = await plan([me, friend]);
    const [a, b] = [await place("dinner"), await place("dinner")];
    await vote(me, p, a, 1); await vote(friend, p, a, 1);
    await vote(me, p, b, 2); await vote(friend, p, b, 2);
    assert.deepEqual(await match(me, friend), { status: "not_enough", signals: 2, needed: 3 });
  });

  test("the score weighs plans, rankings and kinds of place; the biggest split is the group our votes agree least on", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    // (a) four rounds of a dinner plan, only the first picked alike: 25, and a food split.
    const p = await plan([me, friend]);
    const [x, y] = [await place("dinner"), await place("dinner")];
    for (let round = 1; round <= 4; round += 1) {
      await vote(me, p, x, round);
      await vote(friend, p, round === 1 ? x : y, round);
    }
    // (b) five places both ranked, two in the same bucket: 40.
    const both = await Promise.all([1, 2, 3, 4, 5].map(() => place("padel")));
    for (const [i, c] of both.entries()) { await ranked(me, c, "loved"); await ranked(friend, c, i < 2 ? "loved" : "meh"); }
    // (c) kinds: me dinner, cafe, padel; them dinner, cafe, karaoke: 2 of 4 = 50.
    const [dinner, cafe, karaoke] = [await place("dinner"), await place("cafe"), await place("karaoke")];
    for (const s of [dinner, cafe, both[0]]) await visited(me, s);
    for (const s of [dinner, cafe, karaoke]) await visited(friend, s);

    const out = await match(me, friend);
    assert.deepEqual(out, {
      status: "ready",
      score: 36, // (0.25 x 0.4 + 0.40 x 0.4 + 0.50 x 0.2) / 1.0
      parts: { plans: { agreement: 25, rounds: 4 }, rankings: { agreement: 40 }, categories: { overlap: 50, shared: 2 } },
      biggest_split: "food",
      signals: 4 + 2, // rounds and shared kinds; never the places both ranked
    });
    assert.equal((await match(friend, me)).score, 36, "symmetric");
  });

  test("the rankings part is today's snapshot: re-ranking between calls reads nothing new until tomorrow", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    const kinds = [await place("dinner"), await place("cafe"), await place("brunch")];
    for (const s of kinds) { await visited(me, s); await visited(friend, s); }
    const both = await Promise.all([1, 2, 3, 4, 5].map(() => place("dinner")));
    for (const c of both) { await ranked(me, c, "loved"); await ranked(friend, c, "loved"); }
    assert.equal((await match(me, friend)).parts.rankings.agreement, 100);
    await psql(`update place_rankings set bucket = 'meh' where person_id = '${me}'`); // a probe
    assert.equal((await match(me, friend)).parts.rankings.agreement, 100, "same Dubai day: the snapshot stands");
    assert.equal((await match(friend, me)).parts.rankings.agreement, 100, "one snapshot per pair, either way round");
    await psql(`update crew_rank_snapshots set day = day - 1 where person_a = least('${me}'::uuid, '${friend}'::uuid)`);
    assert.equal((await match(me, friend)).parts.rankings.agreement, 0, "a new day, a new reading");
  });

  test("only curated places count toward the rankings part, the same scope as the place board", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    const kinds = [await place("dinner"), await place("cafe"), await place("brunch")];
    for (const s of kinds) { await visited(me, s); await visited(friend, s); }
    const custom = await Promise.all([1, 2, 3, 4, 5].map(async () => {
      const id = await place("dinner");
      await psql(`update spots set source = 'custom', visibility = 'community', created_by_user_id = '${me}' where id = '${id}'`);
      return id;
    }));
    for (const c of custom) { await ranked(me, c, "loved"); await ranked(friend, c, "meh"); }
    assert.equal((await match(me, friend)).parts.rankings, null, "five custom places both ranked: not a reading");
  });

  test("rankings stay private: under five shared places no part; the count never shows; a lone ranking never makes a split", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    const kinds = [await place("dinner"), await place("cafe"), await place("brunch")];
    for (const s of kinds) { await visited(me, s); await visited(friend, s); }
    const before = await match(me, friend);
    const four = await Promise.all([1, 2, 3, 4].map(() => place("dinner")));
    for (const c of four) { await ranked(me, c, "loved"); await ranked(friend, c, "meh"); }
    await psql(`delete from crew_rank_snapshots where person_a = least('${me}'::uuid, '${friend}'::uuid)`);
    const out = await match(me, friend);
    assert.equal(out.parts.rankings, null);
    assert.equal(out.signals, before.signals, "the friend's rankings don't move the count");
    assert.equal(out.score, 100, "only the kinds part counts");

    // Two known rounds (one agreed) and a disagreeing ranking in food: no split from that.
    const p = await plan([me, friend]);
    const [x, y] = [await place("dinner"), await place("dinner")];
    await vote(me, p, x, 1); await vote(friend, p, x, 1);
    await vote(me, p, x, 2); await vote(friend, p, y, 2);
    assert.equal((await match(me, friend)).biggest_split, null);
  });
});

describe("088 crew streak", { skip: SKIP }, () => {
  const monthsAgo = (n: number) => `date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai' - interval '${n} months' + interval '10 days'`;
  const together = async (me: string, friend: string, when: string) => {
    const s = await place("dinner");
    const p = await plan([me, friend], "dinner", when);
    await visited(me, s, p);
    await visited(friend, s, p);
  };
  const ym = (n: number) => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dubai" })); d.setDate(1); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

  test("consecutive months of plans together, ending this month", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    for (const n of [0, 1, 2]) await together(me, friend, monthsAgo(n));
    await together(me, friend, monthsAgo(4)); // a gap before: doesn't join the run
    const out = await streak(me, friend);
    assert.deepEqual(out, { months: 3, since: ym(2), this_month_open: false });
  });

  test("ending last month, this month is still open; older than that is no streak", async () => {
    const [me, friend, old] = [await user(), await user(), await user()];
    await befriend(me, friend);
    await befriend(me, old);
    await together(me, friend, monthsAgo(1));
    assert.deepEqual(await streak(me, friend), { months: 1, since: ym(1), this_month_open: true });
    await together(me, old, monthsAgo(3));
    assert.deepEqual(await streak(me, old), { months: 0, since: null, this_month_open: true });
  });

  test("an outing time in a future month counts as this month, never ahead", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    await together(me, friend, monthsAgo(1));
    await together(me, friend, `${monthsAgo(0)} + interval '2 months'`);
    assert.deepEqual(await streak(me, friend), { months: 2, since: ym(1), this_month_open: false });
  });

  test("a plan only one of us has a visit from doesn't count", async () => {
    const [me, friend] = [await user(), await user()];
    await befriend(me, friend);
    const s = await place("dinner");
    const p = await plan([me, friend], "dinner", monthsAgo(0));
    await visited(me, s, p);
    assert.equal((await streak(me, friend)).months, 0);
  });
});
