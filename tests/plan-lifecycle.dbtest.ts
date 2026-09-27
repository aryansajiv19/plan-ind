// Migration 069 — plan lifecycle (roadmap Phase 1). One describe per item;
// each fails against the pre-069 functions (no "069 applied?" skip gate, on
// purpose). Everything it creates is swept in `after`. NEVER point
// TEST_DATABASE_URL at the live project.
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

// ── fixtures ───────────────────────────────────────────────────────────────
const made = { plans: [] as string[], spots: [] as string[], users: [] as string[] };
const hash = () => randomBytes(32).toString("hex");

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');`);
  made.users.push(uid);
  return uid;
}

type Plan = { id: string; token: string; spots: string[] };
/** One pool of three; `deadline` is SQL. Creator and members get plan_access. */
async function plan(creator: string, deadline: string, members: string[] = []): Promise<Plan> {
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const spots = [randomUUID(), randomUUID(), randomUUID()];
  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ${spots.map((s, i) => `('${s}','QA069 spot ${i}','dinner','Dubai','Test','$$',100,'12am','test')`).join(",")};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA069 plan','dinner','Dubai',${deadline},'open','pool',1,200,'${creator}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(token).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[creator, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  made.spots.push(...spots);
  return { id, token, spots };
}

const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const expire = async (uid: string, planId: string) => JSON.parse(await as(uid, `select expire_plan('${planId}')`));
const stage = (planId: string) => psql(`select status || '/' || stage from plans where id = '${planId}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
});

// ── P4 ──────────────────────────────────────────────────────────────────────
describe("069 deadlines fire without the host (P4)", { skip: SKIP }, () => {
  test("before the deadline a member's call changes nothing", async () => {
    const member = await user();
    const p = await plan(await user(), "now() + interval '1 hour'", [member]);
    const out = await expire(member, p.id);
    assert.equal(out.result, "not_due");
    assert.equal(await stage(p.id), "open/pool");
  });

  test("past the deadline any member advances, the final round gets its hour, and it then decides", async () => {
    const member = await user();
    const p = await plan(await user(), "now() - interval '1 minute'", [member]);
    const advanced = await expire(member, p.id);
    assert.equal(advanced.result, "advanced");
    assert.equal(advanced.finalists.length, 1);
    assert.equal(await psql(`select deadline > now() + interval '55 minutes' from plans where id='${p.id}'`), "t");
    assert.equal((await expire(member, p.id)).result, "not_due");

    await psql(`update plans set deadline = now() - interval '1 minute' where id = '${p.id}'`);
    const decided = await expire(member, p.id);
    assert.equal(decided.result, "decided");
    assert.equal(decided.winner_spot_id, advanced.finalists[0]);
    assert.equal(decided.plan.created_by_user_id, undefined);
    assert.equal((await expire(member, p.id)).result, "already_decided");
  });

  test("a non-member and an unknown plan are refused", async () => {
    const p = await plan(await user(), "now() - interval '1 minute'");
    await assert.rejects(expire(await user(), p.id), /Plan access required/);
    await assert.rejects(expire(await user(), randomUUID()), /Plan access required/);
    assert.equal(await stage(p.id), "open/pool");
  });

  test("two members at once: exactly one transition", async () => {
    const [a, b] = [await user(), await user()];
    const p = await plan(await user(), "now() - interval '1 minute'", [a, b]);
    const prelude = (uid: string) =>
      `set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated;`;
    // A holds the plan row for a second; B, fired just after, waits and then
    // finds the final round already running.
    const [ra, rb] = await Promise.all([
      psql(`${prelude(a)} begin; select expire_plan('${p.id}')->>'result'; select pg_sleep(1); commit;`),
      new Promise((r) => setTimeout(r, 200)).then(() => psql(`${prelude(b)} select expire_plan('${p.id}')->>'result'`)),
    ]);
    assert.deepEqual([ra, rb].map((r) => r.split("\n")[0]).sort(), ["advanced", "not_due"]);
    assert.equal(await stage(p.id), "open/final");
  });
});

// ── booking_owner by identity ───────────────────────────────────────────────
describe("069 the booking claim belongs to an account, not a name", { skip: SKIP }, () => {
  const command = (uid: string, planId: string, token: string, patch: string) =>
    as(uid, `select execute_plan_command('${planId}', '${token}', 'patch', '${patch}'::jsonb)`);
  const rsvpAs = (uid: string, planId: string, name: string) =>
    as(uid, `select set_plan_rsvp('${planId}','${name}',true,'coming','${hash()}')`);
  const owner = (planId: string) => psql(`select coalesce(booking_owner, '<none>') from plans where id = '${planId}'`);

  test("a member who shares the booker's name leaves or deletes the account: the claim stays", async () => {
    const host = await user();
    const [leaver, deleter] = [await user(), await user()];
    const p = await plan(host, "now() + interval '1 day'", [leaver, deleter]);
    await command(host, p.id, p.token, '{"booking_owner": "Sam"}');
    for (const u of [leaver, deleter]) await rsvpAs(u, p.id, "Sam");
    await as(leaver, `select leave_plan('${p.id}')`);
    assert.equal(await owner(p.id), "Sam");
    await as(deleter, "select delete_my_account(false)");
    assert.equal(await owner(p.id), "Sam");
    assert.equal(await psql(`select user_id from plan_booking_owners where plan_id = '${p.id}'`), host);
  });

  test("the booker's own account leaving clears it, and deleting renames it (control)", async () => {
    const host = await user();
    const [booker, other] = [await user(), await user()];
    const p = await plan(host, "now() + interval '1 day'", [booker]);
    const q = await plan(host, "now() + interval '1 day'", [other]);
    // What a member claim will write: the label plus the account behind it.
    for (const [plan_, who] of [[p, booker], [q, other]] as const) {
      await psql(`update plans set booking_owner = 'Kim' where id = '${plan_.id}';
        insert into plan_booking_owners (plan_id, user_id) values ('${plan_.id}', '${who}')`);
    }
    await as(booker, `select leave_plan('${p.id}')`);
    assert.equal(await owner(p.id), "<none>");
    await as(other, "select delete_my_account(false)");
    assert.equal(await owner(q.id), "Former member");
  });
});
