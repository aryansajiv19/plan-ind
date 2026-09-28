// Migration 084 -- the scheduled sweep moves overdue open plans on exactly as
// a member's expire_plan does, and never twice. Each test fails against a
// pre-084 database (no skip gate). Everything it creates is swept in `after`.
// NEVER point TEST_DATABASE_URL at the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomBytes, randomUUID } from "node:crypto";

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

const made = { plans: [] as string[], spots: [] as string[], users: [] as string[] };

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');`);
  made.users.push(uid);
  return uid;
}
/** One pool of three, open; `deadline` is SQL. A deadline far in the past puts it first in the sweep's order. */
async function plan(deadline: string, members: string[] = []): Promise<string> {
  const creator = await user();
  const id = randomUUID();
  const spots = [randomUUID(), randomUUID(), randomUUID()];
  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ${spots.map((s, i) => `('${s}','QA084 spot ${i}','dinner','Dubai','Test','$$',100,'12am','test')`).join(",")};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA084 plan','dinner','Dubai',${deadline},'open','pool',1,200,'${creator}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(randomBytes(16)).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[creator, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  made.spots.push(...spots);
  return id;
}
const stage = (id: string) => psql(`select status || '/' || stage from plans where id = '${id}'`);
const sweep = (limit = 50) => psql(`select expire_due_plans(${limit})`);
const LONG_AGO = "now() - interval '100 years'";

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("084 deadlines fire on their own", { skip: SKIP }, () => {
  test("an overdue plan advances, then decides once its final round is due; a not-yet-due one is left alone", async () => {
    const [overdue, later] = [await plan(LONG_AGO), await plan("now() + interval '1 hour'")];
    await sweep();
    assert.equal(await stage(overdue), "open/final");
    assert.equal(await psql(`select deadline > now() + interval '55 minutes' from plans where id='${overdue}'`), "t", "the final round gets its hour");
    assert.equal(await stage(later), "open/pool");

    await psql(`update plans set deadline = ${LONG_AGO} where id = '${overdue}'`);
    await sweep();
    assert.equal(await psql(`select status || '/' || (winner_spot_id is not null)::text from plans where id='${overdue}'`), "decided/true");
  });

  test("a second run is a no-op", async () => {
    const id = await plan(LONG_AGO);
    await sweep();
    const after1 = await psql(`select concat_ws('|', status, stage, deadline, winner_spot_id) from plans where id='${id}'`);
    await sweep();
    assert.equal(await psql(`select concat_ws('|', status, stage, deadline, winner_spot_id) from plans where id='${id}'`), after1);
  });

  test("a member holding the plan row wins; the sweep skips it without waiting, and it moves exactly once", async () => {
    const member = await user();
    const id = await plan(LONG_AGO, [member]);
    const asMember = `set request.jwt.claims to '{"sub":"${member}","role":"authenticated","is_anonymous":false}'; set role authenticated;`;
    const started = Date.now();
    const [mine] = await Promise.all([
      psql(`${asMember} begin; select expire_plan('${id}')->>'result'; select pg_sleep(1.5); commit;`),
      new Promise((r) => setTimeout(r, 300)).then(() => sweep()),
    ]);
    assert.equal(mine.split("\n")[0], "advanced");
    assert.ok(Date.now() - started < 4000);
    assert.equal(await stage(id), "open/final");
    assert.equal(await psql(`select count(*) from plan_spots where plan_id='${id}' and advanced`), "1", "one finalist, not two");
  });

  test("the limit bounds a tick; no client role may run the sweep or the shared step", async () => {
    const ids = [await plan("now() - interval '101 years'"), await plan("now() - interval '100 years'")];
    await sweep(1);
    assert.deepEqual([await stage(ids[0]), await stage(ids[1])], ["open/final", "open/pool"], "oldest deadline first, one per tick");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(await psql(`select has_function_privilege('${role}', 'expire_due_plans(integer)', 'execute')::text || has_function_privilege('${role}', 'advance_due_plan(uuid)', 'execute')::text`), "falsefalse");
    }
    assert.equal(await psql(`select has_function_privilege('authenticated', 'expire_plan(uuid)', 'execute')`), "t", "members keep expire_plan");
  });
});
