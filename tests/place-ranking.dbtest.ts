// Integration tests for migration 085 (place ranking, community scores,
// "I went here") against a local Supabase Postgres.
// NEVER point TEST_DATABASE_URL at the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";

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

const SKIP = await psql("select to_regclass('public.place_rankings') is not null").then(
  (out) => out === "t" ? false as const : "place_rankings is missing: apply migration 085 to this LOCAL database",
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[] };

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA-${randomBytes(3).toString("hex")}', '${uid}');`);
  made.users.push(uid);
  return uid;
}
/** Curated places of its own, so no two tests share a ranking target. */
async function places(n: number): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID());
  await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source)
    values ${ids.map((id, i) => `('${id}','QA place ${i} ${id.slice(0, 4)}','dinner','Jumeirah','Test','$$',100,'11pm','QA','curated')`).join(",")}`);
  made.spots.push(...ids);
  return ids;
}
/** A visit written as the database owner (what a rated plan leaves behind). */
const visited = (uid: string, spot: string) =>
  psql(`insert into visits (person_id, spot_id, plan_id, visited_at) values ('${uid}','${spot}',null, now() - interval '1 day')`);
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const rank = async (uid: string, spot: string, bucket: string, after: string | null = null, before: string | null = null, answers = "'{}'") =>
  JSON.parse(await as(uid, `select rank_place('${spot}','${bucket}',${after ? `'${after}'` : "null"},${before ? `'${before}'` : "null"},${answers}::jsonb)`));
const list = async (uid: string) =>
  (await as(uid, "select spot_id || ':' || bucket || ':' || position || ':' || score from my_ranking()")).split("\n").filter(Boolean);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("085 rank_place: position, score and buckets", { skip: SKIP }, () => {
  test("slots between the neighbours it is given, renumbers 1..n and rescores linearly in the band", async () => {
    const me = await user();
    const [a, b, c] = await places(3);
    for (const s of [a, b, c]) await visited(me, s);

    assert.deepEqual(await rank(me, a, "loved"), { result: "ranked", score: 10 });
    await rank(me, b, "loved", a, null); // below a
    assert.deepEqual(await list(me), [`${a}:loved:1:10.0`, `${b}:loved:2:8.5`]);
    await rank(me, c, "loved", a, b); // between a and b
    assert.deepEqual(await list(me), [`${a}:loved:1:10.0`, `${c}:loved:2:9.0`, `${b}:loved:3:8.0`]);

    // A move within the bucket: b to the top.
    await rank(me, b, "loved", null, a);
    assert.deepEqual(await list(me), [`${b}:loved:1:10.0`, `${a}:loved:2:9.0`, `${c}:loved:3:8.0`]);
  });

  test("moving to another bucket rescores both; bands never overlap; unrank puts the list back", async () => {
    const me = await user();
    const [a, b, c] = await places(3);
    for (const s of [a, b, c]) await visited(me, s);
    await rank(me, a, "loved");
    await rank(me, b, "loved", a);
    await rank(me, c, "meh");
    const before = await list(me);

    await rank(me, a, "fine");
    assert.deepEqual(await list(me), [`${b}:loved:1:10.0`, `${a}:fine:1:7.0`, `${c}:meh:1:4.0`]);

    await rank(me, a, "loved", null, b); // back where it was
    assert.deepEqual(await list(me), before);

    assert.deepEqual(JSON.parse(await as(me, `select unrank_place('${b}')`)), { result: "unranked" });
    assert.deepEqual(await list(me), [`${a}:loved:1:10.0`, `${c}:meh:1:4.0`]);
    await rank(me, b, "loved", a);
    assert.deepEqual(await list(me), before);
    assert.deepEqual(JSON.parse(await as(me, `select unrank_place('${b}')`)), { result: "unranked" });
    assert.deepEqual(JSON.parse(await as(me, `select unrank_place('${b}')`)), { result: "not_ranked" });
  });

  test("a place you haven't been to, or a neighbour from another bucket, is refused", async () => {
    const me = await user();
    const [a, b, never] = await places(3);
    await visited(me, a);
    await visited(me, b);
    assert.deepEqual(await rank(me, never, "loved"), { result: "not_visited" });
    await rank(me, a, "meh");
    assert.deepEqual(await rank(me, b, "loved", a), { result: "bad_neighbours" });
    assert.deepEqual(await rank(me, a, "loved", a), { result: "bad_neighbours" });
    assert.equal((await list(me)).length, 1);
  });

  test("answers are only the three chips, with their own values", async () => {
    const me = await user();
    const [a] = await places(1);
    await visited(me, a);
    assert.equal((await rank(me, a, "loved", null, null, `'{"vibe":"cosy","value":"fair","again":true}'`)).result, "ranked");
    await assert.rejects(() => rank(me, a, "loved", null, null, `'{"secret":"x"}'`), /answers/);
    await assert.rejects(() => rank(me, a, "loved", null, null, `'{"value":"cheap"}'`), /answers/);
    await assert.rejects(() => rank(me, a, "great"), /loved, fine or meh/);
    assert.equal(await as(me, `select answers->>'vibe' from my_ranking()`), "cosy");
  });
});

describe("085 privacy and community scores", { skip: SKIP }, () => {
  test("one person's rankings are theirs alone; others see only a 5+ rater mean, the count as a band", async () => {
    const raters = [await user(), await user(), await user(), await user(), await user()];
    const w = await user();
    const [s] = await places(1);
    for (const u of raters) await visited(u, s);
    const buckets = ["loved", "fine", "meh", "loved", "fine"]; // 10, 7, 4, 10, 7
    for (let i = 0; i < 4; i += 1) await rank(raters[i], s, buckets[i]);
    assert.equal(await as(w, `select count(*) from place_rankings`), "0", "another account reads no rows");
    assert.equal(await as(w, `select count(*) from my_ranking()`), "0");
    assert.equal(await as(w, `select count(*) from place_scores(array['${s}'::uuid])`), "0", "four raters: no score yet");
    await rank(raters[4], s, buckets[4]);
    assert.equal(await as(w, `select score || '/' || raters from place_scores(array['${s}'::uuid])`), "7.6/5+");
    assert.match(await as(w, `select string_agg(spot_id::text, ',') from top_places(null, 50)`), new RegExp(s));
    await assert.rejects(() => as(w, `update place_rankings set score = 0`), /permission denied/);
    await assert.rejects(() => as(w, `insert into place_rankings (person_id, spot_id, bucket, position, score) values ('${w}','${s}','loved',1,10)`), /permission denied/);
  });

  test("anon can call none of it", async () => {
    for (const call of ["select my_ranking()", "select place_scores(array[]::uuid[])", "select top_places()",
      `select rank_place('${randomUUID()}','loved')`, `select log_visit('${randomUUID()}')`]) {
      await assert.rejects(() => psql(`set role anon; ${call}`), /permission denied/, call);
    }
  });
});

describe("085 log_visit: I went here", { skip: SKIP }, () => {
  test("logs a visit you can then rank; five a day, and deleting one doesn't give the slot back; never in the future; only places you can see", async () => {
    const me = await user();
    const spots = await places(6);
    const log = async (spot: string, at = "null") => JSON.parse(await as(me, `select log_visit('${spot}', ${at})`));
    const first = await log(spots[0]);
    assert.equal(first.result, "logged");
    assert.equal((await rank(me, spots[0], "loved")).result, "ranked");
    for (const s of spots.slice(1, 5)) assert.equal((await log(s)).result, "logged");
    assert.deepEqual(await log(spots[5]), { result: "limited" });
    await as(me, `delete from visits where id = '${first.visit_id}'`);
    assert.deepEqual(await log(spots[5]), { result: "limited" }, "the counter, not the rows, is the limit");
    assert.deepEqual(await log(spots[5], "now() + interval '1 day'"), { result: "bad_date" });

    const other = await user();
    const privateSpot = randomUUID();
    await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source, visibility, created_by_user_id)
      values ('${privateSpot}','QA private','dinner','Jumeirah','Test','$$',0,'11pm','QA','custom','private','${other}')`);
    made.spots.push(privateSpot);
    assert.deepEqual(JSON.parse(await as(other, `select log_visit('${privateSpot}')`)).result, "logged");
    const stranger = await user();
    assert.deepEqual(JSON.parse(await as(stranger, `select log_visit('${privateSpot}')`)), { result: "not_found" });
  });

  test("a plan visit must be the plan's winner", async () => {
    const [me, other] = [await user(), await user()];
    const [winner, elsewhere] = await places(2);
    const plan = randomUUID();
    await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id,winner_spot_id,decided_at,event_time)
        values ('${plan}','QA085','dinner','Dubai','decided','decided',1,'${me}','${winner}', now() - interval '1 day', now() - interval '2 hours');
      insert into plan_access (plan_id,user_id) values ('${plan}','${me}'),('${plan}','${other}');`);
    try {
      await assert.rejects(() => as(me, `insert into visits (person_id, spot_id, plan_id) values ('${me}','${elsewhere}','${plan}')`), /row-level security/);
      await as(me, `insert into visits (person_id, spot_id, plan_id) values ('${me}','${winner}','${plan}')`);
    } finally {
      await psql(`delete from plans where id = '${plan}'`);
    }
  });

  test("the database sets a visit's time; a visit can't be moved into the future", async () => {
    const me = await user();
    const [s] = await places(1);
    const id = await psql(`insert into visits (person_id, spot_id, plan_id, created_at) values ('${me}','${s}', null, now() - interval '400 days') returning id`);
    assert.equal(await psql(`select created_at > now() - interval '1 minute' from visits where id = '${id}'`), "t");
    await assert.rejects(() => as(me, `update visits set visited_at = now() + interval '30 days' where id = '${id}'`), /not one a visit can have/);
  });

  test("a ranking goes with the last visit to the place, and the bucket closes up", async () => {
    const me = await user();
    const [a, b] = await places(2);
    await visited(me, a);
    await visited(me, a);
    await visited(me, b);
    await rank(me, a, "loved");
    await rank(me, b, "loved", a);
    const ids = (await psql(`select id from visits where person_id = '${me}' and spot_id = '${a}' order by id`)).split("\n");
    await as(me, `delete from visits where id = '${ids[0]}'`);
    assert.equal((await list(me)).length, 2, "one visit to a is left: still ranked");
    await as(me, `delete from visits where id = '${ids[1]}'`);
    assert.deepEqual(await list(me), [`${b}:loved:1:10.0`], "a is gone and b rescored to the top");
  });

  test("a place you can't see can't be ranked, even with a visit row", async () => {
    const [me, owner] = [await user(), await user()];
    const hidden = randomUUID();
    await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source, visibility, created_by_user_id)
      values ('${hidden}','QA hidden','dinner','Jumeirah','Test','$$',0,'11pm','QA','custom','private','${owner}')`);
    made.spots.push(hidden);
    await visited(me, hidden);
    assert.deepEqual(await rank(me, hidden, "loved"), { result: "not_visited" });
  });

  test("a plan-less visit can no longer be inserted directly", async () => {
    const me = await user();
    const [s] = await places(1);
    await assert.rejects(
      () => as(me, `insert into visits (person_id, spot_id, plan_id) values ('${me}','${s}', null)`),
      /row-level security/,
    );
  });
});
