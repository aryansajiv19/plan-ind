// Migration 073 — "When", a time poll per plan (roadmap P21). One test per
// rule; each fails against a pre-073 database (no skip gate). Everything it
// creates is swept in `after`. NEVER point TEST_DATABASE_URL at the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes, createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function psql(sql: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(String(e.stderr ?? e.message ?? err).trim());
  }
}

const SKIP = await psql("select auth.uid()").then(
  () => false as const,
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { plans: [] as string[], spots: [] as string[], users: [] as string[] };
async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');`);
  made.users.push(uid);
  return uid;
}
async function plan(host: string, members: string[] = []) {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const spots = [randomUUID(), randomUUID(), randomUUID()];
  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ${spots.map((s, i) => `('${s}','QA073 spot ${i}','dinner','Dubai','Test','$$',100,'12am','test')`).join(",")};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA073 plan','dinner','Dubai',now() + interval '7 days','open','pool',1,200,'${host}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(token).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[host, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  made.spots.push(...spots);
  return { id, token };
}
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const inDays = (d: number, h = 0) => new Date(Date.now() + (d * 24 + h) * 3600e3).toISOString();
const arr = (xs: string[]) => `array[${xs.map((x) => `'${x}'`).join(",")}]::timestamptz[]`;
const setWhen = async (uid: string, p: { id: string; token: string }, xs: string[]) =>
  JSON.parse(await as(uid, `select set_plan_when('${p.id}', '${p.token}', ${arr(xs)})`));
const tick = (uid: string, planId: string, optionId: string, on = true) =>
  as(uid, `select set_time_availability('${planId}', '${optionId}', ${on})`);
const decide = async (host: string, p: { id: string; token: string }) => {
  for (const c of ["advance", "decide"]) await as(host, `select execute_plan_command('${p.id}', '${p.token}', '${c}', '{}'::jsonb)`);
  return psql(`select coalesce(event_time::text, 'none') from plans where id = '${p.id}'`);
};
const startsAt = (planId: string, optionId: string) => psql(`select starts_at::text from plan_time_options where id = '${optionId}' and plan_id = '${planId}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("073 \"When\" time poll", { skip: SKIP }, () => {
  test("the host offers none or 2-4 future times within 60 days; nobody else can", async () => {
    const [host, member] = [await user(), await user()];
    const p = await plan(host, [member]);
    assert.equal((await setWhen(host, p, [inDays(1)])).result, "invalid_options");            // one
    assert.equal((await setWhen(host, p, [inDays(1), inDays(-1)])).result, "invalid_options"); // past
    assert.equal((await setWhen(host, p, [inDays(1), inDays(61)])).result, "invalid_options"); // > 60 days
    assert.equal((await setWhen(host, p, [inDays(1), inDays(1)])).result, "invalid_options");  // duplicate
    assert.equal((await setWhen(member, p, [inDays(1), inDays(2)])).result, "not_host");
    const set = await setWhen(host, p, [inDays(2), inDays(1), inDays(3)]);
    assert.equal(set.result, "set");
    assert.equal(set.options.length, 3);
    assert.equal((await setWhen(host, p, [])).result, "set"); // skipping "When" entirely
    assert.equal(await psql(`select count(*) from plan_time_options where plan_id = '${p.id}'`), "0");
  });

  test("members tick and untick their own plan's times, idempotently; others can't", async () => {
    const [host, member, stranger] = [await user(), await user(), await user()];
    const p = await plan(host, [member]);
    const q = await plan(host);
    const [o1] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    const [foreign] = (await setWhen(host, q, [inDays(1), inDays(2)])).options;
    await tick(member, p.id, o1.id);
    await tick(member, p.id, o1.id); // twice: still one tick
    assert.equal(await psql(`select count(*) from plan_time_votes where plan_id = '${p.id}'`), "1");
    await tick(member, p.id, o1.id, false);
    assert.equal(await psql(`select count(*) from plan_time_votes where plan_id = '${p.id}'`), "0");
    await assert.rejects(tick(stranger, p.id, o1.id), /Plan access required/);
    await assert.rejects(tick(member, p.id, foreign.id), /not on this plan/);
  });

  test("once anyone has ticked, the host can't replace the times", async () => {
    const [host, member] = [await user(), await user()];
    const p = await plan(host, [member]);
    const [o1] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    await tick(member, p.id, o1.id);
    assert.equal((await setWhen(host, p, [inDays(4), inDays(5)])).result, "already_voting");
  });

  test("deciding sets the time to the most-ticked option (a tie goes to the earliest); no ticks, no time", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    const [early, late, never] = (await setWhen(host, p, [inDays(1), inDays(2), inDays(3)])).options;
    for (const u of [a, b]) await tick(u, p.id, late.id);
    await tick(a, p.id, early.id);
    await tick(b, p.id, never.id);
    await tick(b, p.id, never.id, false);
    assert.equal(await decide(host, p), await startsAt(p.id, late.id)); // 2 ticks beats 1

    const tie = await plan(host, [a, b]);
    const [t1, t2] = (await setWhen(host, tie, [inDays(1), inDays(2)])).options;
    await tick(a, tie.id, t2.id);
    await tick(b, tie.id, t1.id);
    assert.equal(await decide(host, tie), await startsAt(tie.id, t1.id)); // 1-1: earliest

    const quiet = await plan(host, [a]);
    await setWhen(host, quiet, [inDays(1), inDays(2)]);
    assert.equal(await decide(host, quiet), "none");
  });

  test("a time the host set by hand wins, and ticking and re-offering stop once decided", async () => {
    const [host, member] = [await user(), await user()];
    const p = await plan(host, [member]);
    const [o1] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    await tick(member, p.id, o1.id);
    const manual = inDays(5);
    await as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '{"event_time": "${manual}"}'::jsonb)`);
    await decide(host, p);
    assert.equal(await psql(`select event_time = '${manual}'::timestamptz from plans where id = '${p.id}'`), "t");
    await assert.rejects(tick(member, p.id, o1.id, false), /decided/);
    assert.equal((await setWhen(host, p, [inDays(3), inDays(4)])).result, "already_decided");
  });

  test("ticks carry no account id, and only members can read them", async () => {
    const [host, member, stranger] = [await user(), await user(), await user()];
    const p = await plan(host, [member]);
    const [o1] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    await tick(member, p.id, o1.id);
    assert.equal(await psql(`select count(*) from information_schema.columns where table_name = 'plan_time_votes' and column_name = 'user_id'`), "0");
    assert.equal(await as(member, `select seat_key from plan_time_votes where plan_id = '${p.id}'`), createHash("md5").update(`${p.id}:${member}`).digest("hex"));
    assert.equal(await as(stranger, `select count(*) from plan_time_votes where plan_id = '${p.id}'`), "0");
    assert.equal(await as(stranger, `select count(*) from plan_time_options where plan_id = '${p.id}'`), "0");
  });

  test("an un-tick reaches Realtime subscribers filtered by plan (replica identity full)", async () => {
    assert.equal(await psql(`select relreplident from pg_class where oid = 'public.plan_time_votes'::regclass`), "f");
  });

  // Security review: a past pick would open rating and plan_has_happened the moment it's decided.
  test("a time that has passed never becomes the plan's time, and can't be ticked", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const toPast = (optionId: string) => psql(`update plan_time_options set starts_at = now() - interval '1 hour' where id = '${optionId}'`);
    const p = await plan(host, [a, b]);
    const [gone, ahead] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    for (const u of [a, b]) await tick(u, p.id, gone.id);
    await tick(a, p.id, ahead.id);
    await toPast(gone.id);
    assert.equal(await decide(host, p), await startsAt(p.id, ahead.id)); // 1 tick ahead beats 2 in the past

    const onlyPast = await plan(host, [a, b]);
    const [o1] = (await setWhen(host, onlyPast, [inDays(1), inDays(2)])).options;
    for (const u of [a, b]) await tick(u, onlyPast.id, o1.id);
    await toPast(o1.id);
    await assert.rejects(tick(a, onlyPast.id, o1.id), /That time has passed/);
    await tick(b, onlyPast.id, o1.id, false); // taking a tick back is fine
    assert.equal(await decide(host, onlyPast), "none"); // a's tick is on a past time: decided_at + 3h stands
  });

  test("leaving an open plan or deleting the account takes the member's ticks, and nobody else's", async () => {
    const [host, leaver, deleter, stays] = [await user(), await user(), await user(), await user()];
    const p = await plan(host, [leaver, deleter, stays]);
    const other = await plan(host, [deleter]);
    const [o1] = (await setWhen(host, p, [inDays(1), inDays(2)])).options;
    const [o2] = (await setWhen(host, other, [inDays(1), inDays(2)])).options;
    for (const u of [leaver, deleter, stays]) await tick(u, p.id, o1.id);
    await tick(deleter, other.id, o2.id);

    assert.equal(JSON.parse(await as(leaver, `select leave_plan('${p.id}')`)).result, "left");
    assert.equal(JSON.parse(await as(deleter, "select delete_my_account(false)")).result, "deleted");
    const seat = (planId: string, uid: string) => createHash("md5").update(`${planId}:${uid}`).digest("hex");
    assert.equal(await psql(`select string_agg(seat_key, ',') from plan_time_votes where plan_id in ('${p.id}', '${other.id}')`), seat(p.id, stays));
  });
});
