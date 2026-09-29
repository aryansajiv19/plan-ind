// Integration tests for migration 086 (leaderboards) against a local Supabase
// Postgres with 085 and 086 applied.
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

const SKIP = await psql("select to_regprocedure('public.leaderboard(text,text,text,integer)') is not null").then(
  (out) => out === "t" ? false as const : "leaderboard() is missing: apply migrations 085 and 086 to this LOCAL database",
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[], plans: [] as string[] };
const tag = () => randomBytes(3).toString("hex");

/** An account named "<First> <Last>", so its board label is "<First> <L>.". */
async function user(first = `Qa${tag()}`, last = "Tester"): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id, emoji) values ('${uid}', '${first} ${last}', '${uid}', '🦊');`);
  made.users.push(uid);
  return uid;
}
async function places(n: number, area: string, source: "curated" | "custom" = "curated", owner: string | null = null): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID());
  await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source, visibility, created_by_user_id)
    values ${ids.map((id, i) => `('${id}','QA ${area} ${i}','dinner','${area}','Test','$$',100,'11pm','QA','${source}','${source === "curated" ? "community" : "private"}',${owner ? `'${owner}'` : "null"})`).join(",")}`);
  made.spots.push(...ids);
  return ids;
}
/** A visit written as the database owner; created_at is server time (085), so an older one is backdated after. */
const visit = async (uid: string, spot: string, createdAt = "now()") => {
  const id = await psql(`insert into visits (person_id, spot_id, plan_id, visited_at) values ('${uid}','${spot}', null, ${createdAt}) returning id`);
  if (createdAt !== "now()") await psql(`update visits set created_at = ${createdAt} where id = '${id}'`);
  return id;
};
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
type Row = { rank: number | null; player_key: string; label: string; emoji: string; points: number | null; band: string | null; is_me: boolean };
const board = async (uid: string, scope: string, key: string | null = null, period = "all", limit = 100): Promise<Row[]> =>
  JSON.parse(await as(uid, `select coalesce(json_agg(b), '[]') from leaderboard('${scope}', ${key ? `'${key}'` : "null"}, '${period}', ${limit}) b`));
const mine = async (uid: string, scope = "dubai", key: string | null = null, period = "all") =>
  (await board(uid, scope, key, period)).find((r) => r.is_me);
/** A decided plan; `voters` cast a final vote first (a group decision needs two). */
async function decidedPlan(host: string, members: string[], winner: string, voters: string[] = []) {
  const id = randomUUID();
  await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id)
      values ('${id}','QA086','dinner','Dubai','open','final',1,'${host}');
    insert into plan_spots (plan_id, spot_id, pool_number) values ('${id}','${winner}',1);
    insert into plan_access (plan_id,user_id) values ${[host, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  for (const v of voters) {
    // Fixture rows: the membership trigger wants a session, which setup has none of.
    await psql(`set session_replication_role = replica;
      insert into votes (plan_id, spot_id, voter_name, value, phase, pool_number, user_id) values ('${id}','${winner}','QA',true,'final',0,'${v}');`);
  }
  await psql(`update plans set status = 'decided', stage = 'decided', winner_spot_id = '${winner}', decided_at = now() where id = '${id}'`);
  return id;
}

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("086 points, derived from rows", { skip: SKIP }, () => {
  test("new place 10, new area 20, ranked 5, photos 3 capped 5 a day, hosted 15 only with company; custom places count nothing", async () => {
    const area = `QA-${tag()}`;
    const [me, friend] = [await user(), await user()];
    const [p1, p2] = await places(2, area);
    const [custom] = await places(1, area, "custom", me);
    const v1 = await visit(me, p1);
    await visit(me, p2);
    await visit(me, p1); // a second visit to the same place: nothing more
    await visit(me, custom);
    assert.equal((await mine(me))?.points, 10 + 10 + 20);

    await as(me, `select rank_place('${p1}','loved')`);
    assert.equal((await mine(me))?.points, 40 + 5);

    for (let i = 0; i < 7; i += 1) {
      await psql(`insert into visit_photos (visit_id, person_id, storage_path) values ('${v1}','${me}','qa/${randomUUID()}.jpg')`);
    }
    assert.equal((await mine(me))?.points, 45 + 5 * 3, "seven photos in a day count as five");

    await decidedPlan(me, [], p1, [me]); // alone: not "hosted"
    await decidedPlan(me, [friend], p1); // two members, nobody voted: a direct plan
    assert.equal((await mine(me))?.points, 60);
    await decidedPlan(me, [friend], p1, [me, friend]);
    assert.equal((await mine(me))?.points, 60 + 15);

    // A plan visit earns only when the group voted on the plan.
    const [unvotedWinner, votedWinner] = await places(2, area);
    const unvoted = await decidedPlan(friend, [me], unvotedWinner);
    const voted = await decidedPlan(friend, [me], votedWinner, [me, friend]);
    await psql(`insert into visits (person_id, spot_id, plan_id) values ('${me}','${unvotedWinner}','${unvoted}'),('${me}','${votedWinner}','${voted}')`);
    assert.equal((await mine(me))?.points, 75 + 10);

    // The area board counts only activity there, without the area bonus.
    assert.equal((await mine(me, "area", area))?.points, 10 + 10 + 5 + 15 + 15 + 10);
  });

  test("hosting earns for two plans a day at most; new places for five a day at most", async () => {
    const area = `QA-${tag()}`;
    const [me, friend] = [await user(), await user()];
    const spots = await places(7, area);
    for (let i = 0; i < 3; i += 1) await decidedPlan(me, [friend], spots[i], [me, friend]);
    const hostedOnly = await mine(me);
    assert.equal(hostedOnly?.points, 2 * 15);
    for (const s of spots) await visit(me, s);
    assert.equal((await mine(me))?.points, 30 + 5 * 10 + 20, "seven new places in a day earn for five");
  });

  test("this month counts only what happened this Dubai month", async () => {
    const area = `QA-${tag()}`;
    const me = await user();
    const [old, recent] = await places(2, area);
    await visit(me, old, "now() - interval '70 days'");
    await visit(me, recent);
    assert.equal((await mine(me, "dubai", null, "all"))?.points, 10 + 10 + 20);
    assert.equal((await mine(me, "dubai", null, "month"))?.points, 10, "the area was new in an earlier month");
  });
});

describe("086 who is shown, and how", { skip: SKIP }, () => {
  test("rows carry a label, an emoji, points and an opaque key; no ids", async () => {
    const area = `QA-${tag()}`;
    const me = await user("Sara", `Ahmed${tag()}`);
    const [p] = await places(1, area);
    await visit(me, p);
    const row = (await board(me, "area", area)).find((r) => r.is_me)!;
    assert.equal(row.label, "Sara A.");
    assert.equal(row.emoji, "🦊");
    assert.match(row.player_key, /^[0-9a-f]{32}$/);
    assert.notEqual(row.player_key, me);
    assert.deepEqual(Object.keys(row).sort(), ["band", "emoji", "is_me", "label", "player_key", "points", "rank"]);
  });

  test("hide_from_boards hides you from public boards, not from your friends board or from yourself", async () => {
    const area = `QA-${tag()}`;
    const [me, hidden] = [await user(), await user()];
    const [p] = await places(1, area);
    await visit(me, p);
    await visit(hidden, p);
    await psql(`insert into friendships (person_id, friend_id) values ('${me}','${hidden}')`);
    const keyOf = async (uid: string) => (await mine(uid, "area", area))!.player_key;
    const hiddenKey = await keyOf(hidden);
    assert.ok((await board(me, "area", area)).some((r) => r.player_key === hiddenKey));

    const hiddenLabel = (await mine(hidden, "friends"))!.label;
    await as(hidden, `update people set hide_from_boards = true where id = '${hidden}'`);
    assert.ok(!(await board(me, "area", area)).some((r) => r.player_key === hiddenKey), "gone from the public board");
    assert.ok((await board(me, "friends")).some((r) => r.label === hiddenLabel), "still on my friends board");
    assert.equal((await mine(hidden, "area", area))?.points, 10, "still sees their own rank");
  });

  test("you are always on your board, even past the limit, and with no points yet", async () => {
    const area = `QA-${tag()}`;
    const [top, me, nobody] = [await user(), await user(), await user()];
    const [p1, p2] = await places(2, area);
    await visit(top, p1);
    await visit(top, p2);
    await visit(me, p1);
    const rows = await board(me, "area", area, "all", 1);
    assert.deepEqual(rows.map((r) => [r.rank, r.is_me]), [[1, false], [2, true]]);
    const empty = await board(nobody, "area", area, "all", 1);
    assert.deepEqual(empty.find((r) => r.is_me), { ...empty.find((r) => r.is_me)!, rank: null, points: 0 });
  });

  test("a place board is you and your friends, by ranking score with the band, never visit counts", async () => {
    const area = `QA-${tag()}`;
    const [a, b, c, stranger] = [await user(), await user(), await user(), await user()];
    const [p] = await places(1, area);
    for (const u of [a, b, c, stranger]) await visit(u, p);
    for (let i = 0; i < 4; i += 1) await visit(c, p); // many visits change nothing here
    await psql(`insert into friendships (person_id, friend_id) values ('${c}','${a}'),('${c}','${b}')`);
    await as(a, `select rank_place('${p}','fine')`);
    await as(b, `select rank_place('${p}','loved')`);
    await as(stranger, `select rank_place('${p}','loved')`);
    const rows = await board(c, "place", p);
    assert.deepEqual(rows.filter((r) => !r.is_me).map((r) => [r.rank, r.band, r.points]), [[1, "loved", null], [2, "fine", null]],
      "two friends; the stranger who also loved it isn't shown");
    assert.ok(!rows.some((r) => r.is_me), "c hasn't ranked it, so c isn't on it");
    assert.deepEqual((await board(stranger, "place", p)).map((r) => [r.band, r.is_me]), [["loved", true]]);
  });

  test("the same person has a different key on each board", async () => {
    const area = `QA-${tag()}`;
    const me = await user();
    const [p] = await places(1, area);
    await visit(me, p);
    const keys = new Set([(await mine(me, "dubai"))!.player_key, (await mine(me, "area", area))!.player_key,
      (await mine(me, "dubai", null, "month"))!.player_key, (await mine(me, "friends"))!.player_key]);
    assert.equal(keys.size, 4);
  });

  test("anon and guest sessions get nothing; bad arguments are refused", async () => {
    await assert.rejects(() => psql(`set role anon; select * from leaderboard('dubai')`), /permission denied/);
    const guest = await user();
    await assert.rejects(() => as(guest, `select * from leaderboard('dubai')`, true), /Sign in/);
    const me = await user();
    await assert.rejects(() => as(me, `select * from leaderboard('everyone')`), /Unknown board/);
    await assert.rejects(() => as(me, `select * from leaderboard('area')`), /needs a place or an area/);
    await assert.rejects(() => as(me, `select * from leaderboard('place', 'not-a-uuid')`), /Unknown place/);
    await assert.rejects(() => as(me, `select * from leaderboard('place', '${"-".repeat(36)}')`), /Unknown place/);
    await assert.rejects(() => as(me, `select * from board_points(null, null)`), /permission denied/);
  });
});
