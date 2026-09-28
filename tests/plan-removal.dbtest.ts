// Migration 080 -- the host removes a member, and the removal sticks. Each
// test fails against a pre-080 database (no skip gate). Everything it creates
// is swept in `after`. NEVER point TEST_DATABASE_URL at the live project.
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
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { plans: [] as string[], users: [] as string[] };

const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA-${randomBytes(3).toString("hex")}', '${uid}');`);
  made.users.push(uid);
  return uid;
}
/** An open plan the members joined, each with an RSVP. */
async function plan(host: string, members: string[]): Promise<string> {
  const id = randomUUID();
  await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id)
      values ('${id}','QA080','dinner','Dubai','open','final',1,'${host}');
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(randomBytes(32)).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[host, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  for (const u of members) await as(u, `select set_plan_rsvp('${id}','QA',true,'coming','${randomBytes(32).toString("hex")}')`);
  return id;
}
const seat = (planId: string, uid: string) => createHash("md5").update(`${planId}:${uid}`).digest("hex");
const remove = async (by: string, planId: string, uid: string) =>
  JSON.parse(await as(by, `select remove_plan_member('${planId}', '${seat(planId, uid)}')`)).result;
const rows = (planId: string, uid: string) => psql(`select
  (select count(*) from plan_access where plan_id='${planId}' and user_id='${uid}') || '|' ||
  (select count(*) from rsvps where plan_id='${planId}' and user_id='${uid}')`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
});

describe("080 host removes a member", { skip: SKIP }, () => {
  test("the host removes a member: their rows go, and the share link no longer lets them back in", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    assert.equal(await rows(p, a), "1|1");
    assert.equal(await remove(host, p, a), "removed");
    assert.equal(await rows(p, a), "0|0");
    assert.equal(await rows(p, b), "1|1", "only the named member goes");
    await assert.rejects(as(a, `select claim_plan_access('${p}')`), /The host removed you from this plan\./);
    assert.equal(await rows(p, a), "0|0");
    // Someone never removed still joins, and removing twice is not_member.
    const c = await user();
    assert.equal(await as(c, `select claim_plan_access('${p}')`), "t");
    assert.equal(await remove(host, p, a), "not_member");
  });

  test("only the host can remove; a member's attempt changes nothing", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    assert.equal(await remove(a, p, b), "not_host");
    assert.equal(await rows(p, b), "1|1");
    assert.equal(await remove(a, randomUUID(), b), "not_found");
  });

  test("the host can't remove themselves", async () => {
    const [host, a] = [await user(), await user()];
    const p = await plan(host, [a]);
    assert.equal(await remove(host, p, host), "cannot_remove_host");
    assert.equal(await psql(`select count(*) from plan_access where plan_id='${p}' and user_id='${host}'`), "1");
  });

  test("a seat key from another plan names nobody here, and deletes nothing", async () => {
    const [host, a] = [await user(), await user()];
    const [p, q] = [await plan(host, [a]), await plan(host, [a])];
    const foreign = seat(q, a);
    assert.equal(JSON.parse(await as(host, `select remove_plan_member('${p}', '${foreign}')`)).result, "not_member");
    assert.equal(await rows(p, a), "1|1");
    assert.equal(await rows(q, a), "1|1");
  });

  test("anon can't call it, and the removal record is not in the Realtime publication", async () => {
    assert.equal(await psql(`select has_function_privilege('anon', 'remove_plan_member(uuid,text)', 'execute')`), "f");
    assert.equal(await psql(`select count(*) from pg_publication_tables where tablename = 'plan_removed_members'`), "0");
  });

  test("the removal record is unreadable to clients and goes with the plan", async () => {
    const [host, a] = [await user(), await user()];
    const p = await plan(host, [a]);
    assert.equal(await remove(host, p, a), "removed");
    await assert.rejects(as(a, `select count(*) from plan_removed_members`), /permission denied/);
    await assert.rejects(as(host, `insert into plan_removed_members (plan_id, user_id) values ('${p}', '${host}')`), /permission denied/);
    assert.equal(await psql(`select count(*) from plan_removed_members where plan_id='${p}'`), "1");
    await psql(`delete from plans where id='${p}'`);
    assert.equal(await psql(`select count(*) from plan_removed_members where plan_id='${p}'`), "0");
  });
});
