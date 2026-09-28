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

const made = { plans: [] as string[], users: [] as string[], spots: [] as string[] };

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
      values ('${id}','QA075','dinner','Dubai','open','final',1,'${host}');
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(token).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[host, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  // Decided a moment later, so these members were there before the decision
  // (078 F2b); add a late joiner with plan_access after this.
  await psql(`update plans set status = 'decided', stage = 'decided' where id = '${id}'`);
  made.plans.push(id);
  return { id, token };
}
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
const claim = async (uid: string, planId: string) => JSON.parse(await as(uid, `select claim_booking('${planId}')`));
const release = async (uid: string, planId: string) => JSON.parse(await as(uid, `select release_booking('${planId}')`));
const holder = (planId: string) => psql(`select coalesce(p.booking_owner, 'none') || '|' || coalesce(b.user_id::text, 'none')
  from plans p left join plan_booking_owners b on b.plan_id = p.id where p.id = '${planId}'`);
const mark = async (uid: string, planId: string, booked: boolean | null) =>
  JSON.parse(await as(uid, `select mark_booked('${planId}', ${booked})`));
const nameOf = (uid: string) => psql(`select display_name from people where id = '${uid}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("075 any member can claim the booking", { skip: SKIP }, () => {
  test("a member claims it under their profile name; another is told it's taken until it's released", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    assert.deepEqual(await claim(a, p.id), { result: "claimed", booking_owner: await nameOf(a), booked: false });
    assert.equal(await holder(p.id), `${await nameOf(a)}|${a}`);
    assert.deepEqual(await claim(b, p.id), { result: "taken", booking_owner: await nameOf(a), booked: false });
    // my_plan_rows says whose it is, even when two members share a name.
    await psql(`update people set display_name = '${await nameOf(a)}' where id = '${b}'`);
    const mine = async (uid: string) => JSON.parse(await as(uid, `select my_plan_rows('${p.id}')`)).my_booking;
    assert.deepEqual([await mine(a), await mine(b)], [true, false]);
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

  test("claiming needs a decided plan; the holder can still release after a reopen", async () => {
    const [host, a] = [await user(), await user()];
    const p = await plan(host, [a]);
    await psql(`update plans set status = 'open', stage = 'final' where id = '${p.id}'`);
    assert.equal((await claim(a, p.id)).result, "not_decided");
    await psql(`update plans set status = 'decided', stage = 'decided' where id = '${p.id}'`);
    assert.equal((await claim(a, p.id)).result, "claimed");
    await psql(`update plans set status = 'open', stage = 'final' where id = '${p.id}'`); // reopened
    assert.equal((await release(a, p.id)).result, "released");
  });

  test("the holder or the host marks it booked and can undo it; another member can't", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    await claim(a, p.id);
    assert.deepEqual(await mark(b, p.id, true), { result: "not_holder", booking_owner: await nameOf(a), booked: false });
    assert.deepEqual(await mark(a, p.id, true), { result: "marked", booking_owner: await nameOf(a), booked: true });
    assert.equal((await claim(b, p.id)).result, "booked");   // frozen while booked
    assert.equal((await release(a, p.id)).result, "booked");
    assert.equal((await mark(a, p.id, false)).result, "unmarked"); // it fell through
    assert.equal((await mark(host, p.id, true)).result, "marked");  // the host, holding no claim
    assert.equal((await mark(host, p.id, null)).result, "invalid");
    assert.equal(await psql(`select booked from plans where id = '${p.id}'`), "t");

    const open = await plan(host, [a]);
    await psql(`update plans set status = 'open', stage = 'final' where id = '${open.id}'`);
    assert.equal((await mark(host, open.id, true)).result, "not_decided");
    assert.deepEqual(await mark(await user(), p.id, true), { result: "not_member" }); // outsiders learn nothing
    assert.deepEqual(await mark(a, randomUUID(), true), { result: "not_found" });
    await assert.rejects(as(a, `select mark_booked('${p.id}', true)`, true), /Sign in required/);
    await assert.rejects(psql(`set role anon; select mark_booked('${p.id}', true)`), /permission denied/);
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

  test("a claim whose account was deleted is cleared and free to take, and the host can still take it over", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    await claim(a, p.id);
    assert.equal(JSON.parse(await as(a, "select delete_my_account(false)")).result, "deleted");
    assert.equal(await holder(p.id), "none|none"); // 078 F1: cleared, not 'Former member'
    assert.equal((await claim(b, p.id)).result, "claimed");
    await as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '{"booking_owner": "me"}'::jsonb)`);
    assert.equal(await holder(p.id), `${await nameOf(host)}|${host}`);
  });

  // ── 078: fixes from the security review of 075 ──────────────────────────
  test("F1: once a booking is unmarked, a claim whose holder is gone is cleared", async () => {
    const [host, a, b, c] = [await user(), await user(), await user(), await user()];
    const p = await plan(host, [a, b, c]);
    await claim(a, p.id);
    await mark(host, p.id, true);
    const aName = await nameOf(a);
    assert.equal(JSON.parse(await as(a, "select delete_my_account(false)")).result, "deleted");
    assert.equal(await holder(p.id), `${aName}|none`); // booked: the name stays, as before
    assert.equal((await mark(host, p.id, false)).result, "unmarked");
    assert.equal(await holder(p.id), "none|none");
    await claim(b, p.id);
    await mark(b, p.id, true);
    assert.equal(JSON.parse(await as(b, `select leave_plan('${p.id}')`)).result, "left"); // left while booked
    await mark(host, p.id, false);
    assert.equal(await holder(p.id), "none|none");
    assert.equal((await claim(c, p.id)).result, "claimed");
  });

  test("F2a: the host can release anyone's unbooked claim; another member can't", async () => {
    const [host, a, b] = [await user(), await user(), await user()];
    const p = await plan(host, [a, b]);
    await claim(a, p.id);
    assert.equal((await release(b, p.id)).result, "not_yours");
    assert.deepEqual(await release(host, p.id), { result: "released", booking_owner: null, booked: false });
    assert.equal(await holder(p.id), "none|none");
  });

  /** Advanced plan_spots: 2+ is a plan reopen_plan could reopen; 1 is a direct plan. */
  const finalists = async (planId: string, n: number) => {
    const ids = Array.from({ length: n }, () => randomUUID());
    await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
        values ${ids.map((id) => `('${id}','QA078','dinner','Dubai','Test','$$',100,'12am','test')`).join(",")};
      insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${ids.map((id) => `('${planId}','${id}',1,true)`).join(",")};`);
    made.spots.push(...ids);
  };

  test("F2b: a holder who joined after the decision can't mark it booked; the host and an early holder can", async () => {
    const [host, early, late] = [await user(), await user(), await user()];
    const p = await plan(host, [early]);
    await finalists(p.id, 2);
    await psql(`insert into plan_access (plan_id, user_id) values ('${p.id}', '${late}')`);
    assert.equal((await claim(late, p.id)).result, "claimed");
    assert.deepEqual(await mark(late, p.id, true), { result: "joined_after_decision", booking_owner: await nameOf(late), booked: false });
    assert.equal((await mark(host, p.id, true)).result, "marked");
    assert.equal((await mark(late, p.id, false)).result, "unmarked"); // undoing stays open to them
    await release(late, p.id);
    await claim(early, p.id);
    assert.equal((await mark(early, p.id, true)).result, "marked");

    // A direct plan has one finalist and can't be reopened: nothing to lock.
    const direct = await plan(host, []);
    await finalists(direct.id, 1);
    await psql(`insert into plan_access (plan_id, user_id) values ('${direct.id}', '${late}')`);
    await claim(late, direct.id);
    assert.equal((await mark(late, direct.id, true)).result, "marked");
  });

  test("the host's older patch path clears a claim held by nobody when it unbooks too", async () => {
    const [host, a] = [await user(), await user()];
    const p = await plan(host, [a]);
    await claim(a, p.id);
    await mark(host, p.id, true);
    await as(a, "select delete_my_account(false)");
    await as(host, `select execute_plan_command('${p.id}', '${p.token}', 'patch', '{"booked": false}'::jsonb)`);
    assert.equal(await holder(p.id), "none|none");
  });

  test("applying 078 clears unbooked claims already held by nobody, and keeps the rest", async () => {
    const [host, a] = [await user(), await user()];
    const [stale, noRow, kept, booked] = [await plan(host, [a]), await plan(host, [a]), await plan(host, [a]), await plan(host, [a])];
    await claim(a, kept.id);
    const m = new URL("../supabase/migration-078-booking-fixes.sql", import.meta.url).pathname;
    const sql = (await import("node:fs")).readFileSync(m, "utf8");
    const cleanup = sql.slice(sql.indexOf("-- Plans already in that state"), sql.lastIndexOf("commit;"));
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-c", `begin;
        update plans set booking_owner = 'Former member' where id in ('${stale.id}', '${noRow.id}', '${booked.id}');
        insert into plan_booking_owners (plan_id, user_id) values ('${stale.id}', null), ('${booked.id}', null);
        update plans set booked = true where id = '${booked.id}';`,
      "-c", cleanup,
      "-c", `select string_agg(coalesce(p.booking_owner, 'none') || ':' || (b.plan_id is not null)::text, ',' order by array_position(
        array['${stale.id}','${noRow.id}','${kept.id}','${booked.id}']::uuid[], p.id))
        from plans p left join plan_booking_owners b on b.plan_id = p.id
        where p.id in ('${stale.id}', '${noRow.id}', '${kept.id}', '${booked.id}')`,
      "-c", "rollback"], { timeout: 60000 });
    assert.equal(stdout.trim().split("\n").filter(Boolean).pop(),
      `none:false,none:false,${await nameOf(a)}:true,Former member:true`); // booked is left alone
  });
});

