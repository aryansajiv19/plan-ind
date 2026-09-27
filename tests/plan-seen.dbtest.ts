// Migration 074 -- "what changed since you last looked" (roadmap P31). Each
// test fails against a pre-074 database (no skip gate). Everything it creates
// is swept in `after`. NEVER point TEST_DATABASE_URL at the live project.
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

const SKIP = await psql("select auth.uid()").then(
  () => false as const,
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { plans: [] as string[], users: [] as string[] };

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
    values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now())`);
  made.users.push(uid);
  return uid;
}
/** An open plan; the creator and members get plan_access in the same statement. */
async function plan(creator: string, members: string[] = []): Promise<string> {
  const id = randomUUID();
  await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id)
      values ('${id}','QA074','dinner','Dubai','open','pool',1,'${creator}');
    insert into plan_access (plan_id,user_id) values ${[creator, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  return id;
}
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
const changedAt = (id: string) => psql(`select stage_changed_at from plans where id = '${id}'`);
const touch = async (uid: string, id: string) => JSON.parse(await as(uid, `select touch_plan_seen('${id}')`)).result;
const rail = (uid: string, limit = 8) =>
  as(uid, `select coalesce(string_agg(id || ':' || changed, ','), '') from my_plan_rail(${limit})`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
});

describe("074 what changed since you last looked (P31)", { skip: SKIP }, () => {
  test("stage_changed_at is stamped at creation and on every stage change, and on nothing else", async () => {
    const id = await plan(await user());
    const born = await changedAt(id);
    assert.notEqual(born, "");
    // Naming stage without changing it (as a patch might) is not a change.
    await psql(`update plans set title = 'QA074 renamed', stage = stage, event_time = now() + interval '1 day' where id = '${id}'`);
    assert.equal(await changedAt(id), born);
    let last = born;
    for (const next of ["status = 'open', stage = 'final'", "status = 'decided', stage = 'decided'", "status = 'open', stage = 'final'"]) {
      await psql(`update plans set ${next} where id = '${id}'`);
      const at = await changedAt(id);
      assert.ok(await psql(`select '${at}'::timestamptz > '${last}'::timestamptz`) === "t", `${next}: ${at} after ${last}`);
      last = at;
    }
  });

  test("touch_plan_seen writes the caller's own row, as now(); a non-member is told so; anonymous is refused", async () => {
    const [host, member, stranger] = [await user(), await user(), await user()];
    const id = await plan(host, [member]);
    await psql(`update plan_access set last_seen_at = now() - interval '1 day' where plan_id = '${id}'`);
    assert.equal(await touch(member, id), "seen");
    assert.equal(await psql(`select string_agg((last_seen_at > now() - interval '1 minute')::text, ',' order by user_id = '${member}')
      from plan_access where plan_id = '${id}'`), "false,true"); // the host's row is untouched
    assert.equal(await touch(stranger, id), "not_member");
    assert.equal(await psql(`select count(*) from plan_access where plan_id = '${id}' and user_id = '${stranger}'`), "0");
    await assert.rejects(as(member, `select touch_plan_seen('${id}')`, true), /Sign in required/);
    await assert.rejects(psql(`set role anon; select touch_plan_seen('${id}')`), /permission denied/);
  });

  test("the rail puts what changed since you looked first, drops it once seen, and shows no one else's plans", async () => {
    const [me, other] = [await user(), await user()];
    const older = await plan(me);
    await psql(`update plans set stage = 'final' where id = '${older}'`); // moved on after I last looked
    const newer = await plan(me);                                        // joined, and seen as it stands
    await plan(other);
    assert.equal(await rail(me), `${older}:true,${newer}:false`);
    assert.equal(await touch(me, older), "seen");
    assert.equal(await rail(me), `${newer}:false,${older}:false`); // then most recently changed
    assert.equal(await rail(me, 0), `${newer}:false`);             // the limit is clamped to 1..20
    assert.equal(await as(me, "select count(*) from my_plan_rail()", true), "0"); // RLS: anonymous reads nothing
  });
});
