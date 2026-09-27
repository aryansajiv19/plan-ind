// Migration 075 -- any member can claim the booking. Each test fails against a
// pre-075 database (no skip gate). Everything it creates is swept in `after`.
// NEVER point TEST_DATABASE_URL at the live project.
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

/** An account; `name` null means no profile row. */
async function user(name: string | null = `QA-${randomBytes(3).toString("hex")}`): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    ${name ? `insert into people (id, display_name, auth_user_id) values ('${uid}', '${name}', '${uid}');` : ""}`);
  made.users.push(uid);
  return uid;
}
async function plan(host: string, members: string[]): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  await psql(`insert into plans (id,title,category,area,status,stage,pool_count,created_by_user_id)
      values ('${id}','QA075','dinner','Dubai','decided','decided',1,'${host}');
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(token).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[host, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  return { id, token };
}
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
const claim = async (uid: string, planId: string) => JSON.parse(await as(uid, `select claim_booking('${planId}')`));
const release = async (uid: string, planId: string) => JSON.parse(await as(uid, `select release_booking('${planId}')`));
const holder = (planId: string) => psql(`select coalesce(p.booking_owner, 'none') || '|' || coalesce(b.user_id::text, 'none')
  from plans p left join plan_booking_owners b on b.plan_id = p.id where p.id = '${planId}'`);
const nameOf = (uid: string) => psql(`select display_name from people where id = '${uid}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
});

describe("075 any member can claim the booking", { skip: SKIP }, () => {
  test("a member claims it under their profile name; another is told it's taken until it's released", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    assert.deepEqual(await claim(a, p.id), { result: "claimed", booking_owner: await nameOf(a) });
    assert.equal(await holder(p.id), `${await nameOf(a)}|${a}`);
    assert.deepEqual(await claim(b, p.id), { result: "taken", booking_owner: await nameOf(a) });
    assert.equal((await release(b, p.id)).result, "not_yours");
    assert.equal((await claim(a, p.id)).result, "claimed"); // claiming your own again is fine
    assert.equal((await release(a, p.id)).result, "released");
    assert.equal(await holder(p.id), "none|none");
    assert.equal((await claim(b, p.id)).result, "claimed");
  });

  test("two members claiming at once: one gets it, the other is told it's taken", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    const results = (await Promise.all([claim(a, p.id), claim(b, p.id)])).map((r) => r.result).sort();
    assert.deepEqual(results, ["claimed", "taken"]);
  });

  test("once booked nothing moves; strangers, unknown plans and no profile get answers; signed-out is refused", async () => {
    const [host, a, b, stranger, nameless] = [await user(), await user(), await user(), await user(), await user(null)];
    const p = await plan(host, [a, b, nameless]);
    await claim(a, p.id);
    await as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '{"booked": true}'::jsonb)`);
    assert.equal((await release(a, p.id)).result, "booked");
    assert.equal((await claim(b, p.id)).result, "booked");
    assert.equal(await holder(p.id), `${await nameOf(a)}|${a}`);

    const q = await plan(host, [nameless]);
    assert.equal((await claim(stranger, q.id)).result, "not_member");
    assert.equal((await claim(a, randomUUID())).result, "not_found");
    assert.equal((await claim(nameless, q.id)).result, "no_profile");
    await assert.rejects(as(a, `select claim_booking('${q.id}')`, true), /Sign in required/);
    await assert.rejects(psql(`set role anon; select release_booking('${q.id}')`), /permission denied/);
  });

  // Security audit: leave_plan keeps a booked claim, so a booking that fell through stranded it.
  test("a claim held by someone who has left is free once the booking falls through", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    const patch = (json: string) => as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '${json}'::jsonb)`);
    await claim(a, p.id);
    await patch('{"booked": true}');
    assert.equal(JSON.parse(await as(a, `select leave_plan('${p.id}')`)).result, "left");
    assert.equal(await holder(p.id), `${await nameOf(a)}|${a}`); // kept: the reservation existed
    await patch('{"booked": false}');
    assert.equal((await claim(b, p.id)).result, "claimed");
  });

  test("a claim whose account was deleted is free to take, and the host can still take it over", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    await claim(a, p.id);
    assert.equal(JSON.parse(await as(a, "select delete_my_account(false)")).result, "deleted");
    assert.equal(await holder(p.id), "Former member|none");
    assert.equal((await claim(b, p.id)).result, "claimed");
    await as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '{"booking_owner": "me"}'::jsonb)`);
    assert.equal(await holder(p.id), `${await nameOf(host)}|${host}`);
  });
});
