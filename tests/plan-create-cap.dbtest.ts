// Integration tests for migration 087 (the per-account daily plan-create cap)
// against a local Supabase Postgres.
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
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 60000 },
    );
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(String(e.stderr ?? e.message ?? err).trim());
  }
}

const SKIP = await psql("select to_regclass('public.plan_create_counts') is not null").then(
  (out) => out === "t" ? false as const : "plan_create_counts is missing: apply migration 087 to this LOCAL database",
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[] };

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA087', '${uid}');`);
  made.users.push(uid);
  return uid;
}
async function place(): Promise<string> {
  const id = randomUUID();
  await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source)
    values ('${id}','QA087 place','dinner','Jumeirah','Test','$$',100,'11pm','QA','curated')`);
  made.spots.push(id);
  return id;
}
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
/** n direct plans in one round trip, as the account itself (straight to the RPC, no route). */
const direct = (uid: string, spot: string, n: number) =>
  as(uid, `do $$ begin for i in 1..${n} loop perform create_direct_plan('{"title":"QA087"}'::jsonb, '${spot}'); end loop; end $$`);
const planCount = (uid: string) => psql(`select count(*) from plans where created_by_user_id = '${uid}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) {
    await psql(`delete from plans where created_by_user_id in (${ids(made.users)})`);
    await psql(`delete from auth.users where id in (${ids(made.users)})`);
  }
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("087 plan-create cap", { skip: SKIP }, () => {
  test("fifty plans a Dubai day through the RPC; the next is refused with 54000, and deleting one gives nothing back", async () => {
    const me = await user();
    const spot = await place();
    await direct(me, spot, 50);
    assert.equal(await planCount(me), "50");
    await assert.rejects(() => direct(me, spot, 1), /Too many plans started today/);
    const nine = await Promise.all(Array.from({ length: 9 }, () => place()));
    await assert.rejects(
      () => as(me, `select create_secure_plan('{"title":"QA087","category":"dinner","deadline":"${new Date(Date.now() + 864e5).toISOString()}"}'::jsonb, array[${nine.map((i) => `'${i}'`).join(",")}]::uuid[])`),
      /Too many plans started today/, "the other door is capped too",
    );
    assert.equal(await planCount(me), "50", "the refused inserts left nothing");

    const one = await psql(`select id from plans where created_by_user_id = '${me}' limit 1`);
    await as(me, `select delete_plan('${one}', null)`).catch(() => undefined);
    await psql(`delete from plans where id = '${one}'`);
    await assert.rejects(() => direct(me, spot, 1), /Too many plans started today/);
  });

  test("each account has its own fifty; the database owner's inserts don't count", async () => {
    const [a, b] = [await user(), await user()];
    const spot = await place();
    await direct(a, spot, 50);
    await direct(b, spot, 1);
    assert.equal(await planCount(b), "1");
    await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id)
      values ('${randomUUID()}','QA087 admin','dinner','Dubai','open','pool',1,'${a}')`);
    assert.equal(await planCount(a), "51", "an owner insert isn't a client session");
  });
});
