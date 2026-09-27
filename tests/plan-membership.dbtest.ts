// P34: plan RPCs that had no test at any tier -- leave_plan, delete_plan on an
// open plan, create_direct_plan. One test per result code or refusal family.
// Everything it creates is swept in `after`. NEVER point TEST_DATABASE_URL at
// the live project.
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
const made = { spots: [] as string[], users: [] as string[] };
const hash = () => randomBytes(32).toString("hex");

/** An account with a profile; `dob` null means no age on file. */
async function user(dob: string | null = "1990-01-01"): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA', '${uid}');
    ${dob ? `insert into member_ages (user_id, date_of_birth) values ('${uid}', '${dob}');` : ""}`);
  made.users.push(uid);
  return uid;
}

async function spot(minimumAge: number | "default" = "default"): Promise<string> {
  const id = randomUUID();
  await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,minimum_age)
    values ('${id}','QA-P34','dinner','Dubai','Test','$$',100,'12am','test',${minimumAge})`);
  made.spots.push(id);
  return id;
}

type Plan = { id: string; token: string; spots: string[] };
/** An open one-pool plan of three; the creator and members get plan_access. */
async function plan(creator: string, members: string[] = []): Promise<Plan> {
  const id = randomUUID();
  const token = hash();
  const spots = [await spot(), await spot(), await spot()];
  await psql(`
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA-P34 plan','dinner','Dubai',now() + interval '1 day','open','pool',1,200,'${creator}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(token).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[creator, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  return { id, token, spots };
}
const decide = (p: Plan) => psql(`update plans set status = 'decided', stage = 'decided', winner_spot_id = '${p.spots[0]}',
  event_time = now() - interval '1 hour' where id = '${p.id}'`);

const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const vote = (uid: string, p: Plan) =>
  as(uid, `select cast_plan_vote('${p.id}','${p.spots[0]}','QA',true,'pool',1::smallint,'${hash()}')`);
const reply = (uid: string, p: Plan) => as(uid, `select set_plan_rsvp('${p.id}','QA',true,'coming','${hash()}')`);
const count = (table: string, p: Plan, uid: string) =>
  psql(`select count(*) from ${table} where plan_id = '${p.id}' and user_id = '${uid}'`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  // Users before spots: 065 refuses to delete a spot someone has visited.
  if (made.users.length) await psql(`delete from plans where created_by_user_id in (${ids(made.users)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

// ── leave_plan ──────────────────────────────────────────────────────────────
describe("leave_plan", { skip: SKIP }, () => {
  const leave = async (uid: string, planId: string) => JSON.parse(await as(uid, `select leave_plan('${planId}')`)).result;

  test("an unknown plan, the host and a non-member get an answer, not an error", async () => {
    const [host, stranger] = [await user(), await user()];
    const p = await plan(host);
    assert.equal(await leave(host, randomUUID()), "not_found");
    assert.equal(await leave(host, p.id), "host_cannot_leave");
    assert.equal(await leave(stranger, p.id), "not_member");
  });

  test("leaving an open plan takes the member's vote, reply and access, and nobody else's", async () => {
    const [host, leaver, stays] = [await user(), await user(), await user()];
    const p = await plan(host, [leaver, stays]);
    for (const u of [leaver, stays]) { await vote(u, p); await reply(u, p); }
    assert.equal(await leave(leaver, p.id), "left");
    assert.deepEqual(await Promise.all(["votes", "rsvps", "plan_access"].map((t) => count(t, p, leaver))), ["0", "0", "0"]);
    assert.deepEqual(await Promise.all(["votes", "rsvps", "plan_access"].map((t) => count(t, p, stays))), ["1", "1", "1"]);
  });

  test("leaving a decided plan keeps the ballot that decided it and takes the rating", async () => {
    const [host, leaver] = [await user(), await user()];
    const p = await plan(host, [leaver]);
    await vote(leaver, p);
    await decide(p);
    await as(leaver, `select rate_plan('${p.id}','${p.spots[0]}','x',4,true,'${hash()}')`);
    assert.equal(await leave(leaver, p.id), "left");
    assert.deepEqual([await count("votes", p, leaver), await count("ratings", p, leaver)], ["1", "0"]);
  });
});

// ── delete_plan ─────────────────────────────────────────────────────────────
describe("delete_plan", { skip: SKIP }, () => {
  test("the host deletes an open plan with everything under it; an unknown plan is not_found", async () => {
    const [host, member] = [await user(), await user()];
    const p = await plan(host, [member]);
    await vote(member, p);
    await reply(member, p);
    const out = JSON.parse(await as(host, `select delete_plan('${p.id}', '${p.token}')`));
    assert.deepEqual([out.result, out.participants], ["deleted", 1]); // one account, vote and reply
    assert.equal(await psql(`select (select count(*) from plans where id = '${p.id}')
      + (select count(*) from plan_access where plan_id = '${p.id}') + (select count(*) from votes where plan_id = '${p.id}')`), "0");
    assert.equal(JSON.parse(await as(host, `select delete_plan('${randomUUID()}', '${p.token}')`)).result, "not_found");
  });
});

// ── create_direct_plan ──────────────────────────────────────────────────────
describe("create_direct_plan", { skip: SKIP }, () => {
  const direct = (uid: string, spotId: string, fields = `{"title":"QA-P34"}`) =>
    as(uid, `select create_direct_plan('${fields}'::jsonb, '${spotId}')`);

  test("it makes a decided plan of one place, hosted and joined by its creator, with nothing to reopen", async () => {
    const uid = await user();
    const place = await spot();
    const out = JSON.parse(await direct(uid, place, `{"title":"QA-P34","budgetPerPerson":200}`));
    assert.match(out.hostToken, /^[0-9a-f]{64}$/);
    assert.equal(await psql(`select concat_ws('|', status, stage, winner_spot_id, created_by_user_id, budget_per_person,
        decided_at is not null,
        (select count(*) from plan_spots where plan_id = p.id and advanced),
        (select count(*) from plan_access where plan_id = p.id and user_id = '${uid}'),
        (select token_hash from plan_host_tokens where plan_id = p.id))
      from plans p where id = '${out.id}'`),
      ["decided", "decided", place, uid, 200, "t", 1, 1, createHash("sha256").update(out.hostToken).digest("hex")].join("|"));
    const reopened = JSON.parse(await as(uid, `select reopen_plan('${out.id}', '${out.hostToken}', null)`));
    assert.equal(reopened.result, "no_rounds");
  });

  test("it refuses another account's place, an age-gated place, no age on file, and malformed fields", async () => {
    const [adult, teen, noAge, owner] = [await user(), await user("2010-01-01"), await user(null), await user()];
    const [open, gated] = [await spot(), await spot(21)];
    const theirs = randomUUID();
    await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,source,visibility,created_by_user_id)
      values ('${theirs}','QA-P34 custom','dinner','Dubai','Custom place','$$',0,'Flexible','note','custom','private','${owner}')`);
    made.spots.push(theirs);
    await assert.rejects(direct(adult, theirs), /That place is unavailable/);
    await assert.rejects(direct(teen, gated), /That place is not age appropriate/);
    await assert.rejects(direct(noAge, open), /Complete age details first/);
    await assert.rejects(direct(adult, open, `{"title":"  "}`), /A title and a place are required/);
    await assert.rejects(direct(adult, open, `{"title":"QA","status":"open"}`), /Unsupported plan fields/);
    await assert.rejects(direct(adult, open, `{"title":"QA","budgetPerPerson":99999}`), /Invalid budget/);
    assert.equal(await psql(`select count(*) from plans where created_by_user_id in ('${adult}','${teen}','${noAge}')`), "0");
  });
});
