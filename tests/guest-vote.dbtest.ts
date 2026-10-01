// Migration 099: guest voting. A guest is an anonymous session bound to ONE
// plan by guest_sessions. Every refusal below is paired with a positive
// control in the same test (a guest who CAN do the neighbouring thing), so a
// broken rig cannot pass them. Everything created is swept in `after`; the
// stack's 'server-control' secret is swapped for a test one and restored.
// NEVER point TEST_DATABASE_URL at the live project.
import test, { after, before, describe } from "node:test";
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

const SKIP = await psql("select 1 from pg_proc where proname = 'join_plan_as_guest'").then(
  (out) => (out ? (false as const) : "migration 099 is not applied to this database"),
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const SECRET = "099-guest-test-secret";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
let savedSecret = "";
const made = { spots: [] as string[], users: [] as string[] };
const hash = () => randomBytes(32).toString("hex");

before(async () => {
  if (SKIP) return;
  // Supabase grants its roles access to realtime.messages; the plain-Postgres
  // shim does not, and without it the presence check would fail for the wrong reason.
  await psql("grant select on realtime.messages to authenticated");
  savedSecret = await psql("select secret_hash from app_control_secrets where name = 'server-control'");
  await psql(`insert into app_control_secrets(name, secret_hash) values ('server-control', '${sha256(SECRET)}')
    on conflict (name) do update set secret_hash = excluded.secret_hash`);
});

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) await psql(`delete from plans where created_by_user_id in (${ids(made.users)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
  await psql("delete from app_rate_limits where scope like 'guest-join%'");
  if (savedSecret) await psql(`update app_control_secrets set secret_hash = '${savedSecret}' where name = 'server-control'`);
  else await psql("delete from app_control_secrets where name = 'server-control'");
});

// ── fixtures ───────────────────────────────────────────────────────────────
async function account(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA', '${uid}');
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');`);
  made.users.push(uid);
  return uid;
}

async function anon(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, is_anonymous, created_at, updated_at)
    values ('${uid}','authenticated','authenticated', true, now(), now())`);
  made.users.push(uid);
  return uid;
}

async function spot(minimumAge = 0): Promise<string> {
  const id = randomUUID();
  await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,minimum_age)
    values ('${id}','QA-099','dinner','Dubai','Test','$$',100,'12am','test',${minimumAge})`);
  made.spots.push(id);
  return id;
}

type Plan = { id: string; spots: string[] };
async function plan(creator: string, minimumAge = 0): Promise<Plan> {
  const id = randomUUID();
  const spots = [await spot(minimumAge), await spot(), await spot()];
  await psql(`
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA-099 plan','dinner','Dubai',now() + interval '1 day','open','pool',1,200,'${creator}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_access (plan_id,user_id) values ('${id}','${creator}');`);
  return { id, spots };
}

const asAccount = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const asGuest = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":true}'; set role authenticated; ${sql}`);

/** The route's step: an anonymous session binds itself to a plan with the control secret. */
async function join(uid: string, planId: string, name = "Sam", secret = SECRET): Promise<string> {
  const out = await asGuest(uid, `select join_plan_as_guest('${secret}','${planId}','${name}')`);
  return JSON.parse(out).status;
}
const vote = (as: typeof asGuest, uid: string, p: Plan, spotIdx = 0, name = "ignored") =>
  as(uid, `select cast_plan_vote('${p.id}','${p.spots[spotIdx]}','${name}',true,'pool',1::smallint,'${hash()}')`);
const reason = (promise: Promise<unknown>) => promise.then(() => "NO ERROR", (e: Error) => e.message);
const n = (sql: string) => psql(sql);

// ── join ───────────────────────────────────────────────────────────────────
describe("join_plan_as_guest", { skip: SKIP }, () => {
  test("a guest joins, reads its plan and votes under its stored name, not the request's", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    assert.equal(await join(g, p.id, "Sam"), "joined");
    assert.equal(await asGuest(g, `select count(*) from plans where id = '${p.id}'`), "1");
    assert.equal(await asGuest(g, `select count(*) from plan_spots where plan_id = '${p.id}'`), "3");
    await vote(asGuest, g, p, 0, "Forged Name");
    assert.equal(await n(`select voter_name from votes where plan_id = '${p.id}' and user_id = '${g}'`), "Sam");
    assert.equal(await asGuest(g, `select count(*) from votes where plan_id = '${p.id}'`), "1");
  });

  test("the control secret is required; a browser cannot join itself", async () => {
    const p = await plan(await account());
    const g = await anon();
    const msg = await reason(join(g, p.id, "Sam", "not-the-secret"));
    assert.match(msg, /Server authorization required/);
    assert.equal(await n(`select count(*) from guest_sessions where user_id = '${g}'`), "0");
    assert.equal(await join(g, p.id), "joined"); // positive control: the right secret works
  });

  test("a permanent account is told to use claim_plan_access", async () => {
    const [host, member] = [await account(), await account()];
    const p = await plan(host);
    assert.match(await reason(asAccount(member, `select join_plan_as_guest('${SECRET}','${p.id}','Sam')`)), /claim_plan_access/);
  });

  test("joining twice is idempotent and keeps one name; a second plan is refused", async () => {
    const host = await account();
    const [a, b] = [await plan(host), await plan(host)];
    const g = await anon();
    assert.equal(await join(g, a.id, "Sam"), "joined");
    assert.equal(await join(g, a.id, "Other"), "already");
    assert.equal(await n(`select count(*) from guest_sessions where user_id = '${g}'`), "1");
    assert.equal(await n(`select display_name from guest_sessions where user_id = '${g}'`), "Sam");
    assert.equal(await join(g, b.id), "other_plan");
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${b.id}' and user_id = '${g}'`), "0");
  });

  test("a plan with an age-gated place refuses guests, a plain plan does not", async () => {
    const host = await account();
    const [gated, plain] = [await plan(host, 21), await plan(host)];
    const g = await anon();
    assert.equal(await join(g, gated.id), "age_gated");
    assert.equal(await n(`select count(*) from plan_access where user_id = '${g}'`), "0");
    assert.equal(await join(g, plain.id), "joined");
  });

  test("a place added later with an age limit shuts the guest out of reads and votes", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    assert.equal(await join(g, p.id), "joined");
    await vote(asGuest, g, p); // positive control
    const gatedSpot = await spot(21);
    await psql(`insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ('${p.id}','${gatedSpot}',1,false)`);
    assert.match(await reason(vote(asGuest, g, p, 1)), /Sign in to vote/);
    assert.equal(await asGuest(g, `select count(*) from plans where id = '${p.id}'`), "0");
  });

  test("the per-plan cap: 20 guests join, the 21st is told the plan is full", async () => {
    const p = await plan(await account());
    const guests = await Promise.all(Array.from({ length: 21 }, anon));
    const results: string[] = [];
    for (const g of guests) results.push(await join(g, p.id)); // sequential: the cap is the contract
    assert.equal(results.filter((r) => r === "joined").length, 20);
    assert.equal(results[20], "full");
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${p.id}' and user_id = '${guests[20]}'`), "0");
  });

  test("the cap holds under concurrent joins", async () => {
    const p = await plan(await account());
    const guests = await Promise.all(Array.from({ length: 24 }, anon));
    const results = await Promise.all(guests.map((g) => join(g, p.id)));
    assert.equal(results.filter((r) => r === "joined").length, 20);
    assert.equal(results.filter((r) => r === "full").length, 4);
  });

  test("a guest the host removed cannot rejoin on the same session", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    assert.equal(await join(g, p.id), "joined");
    const seat = createHash("md5").update(`${p.id}:${g}`).digest("hex");
    assert.equal(JSON.parse(await asAccount(host, `select remove_plan_member('${p.id}','${seat}')`)).result, "removed");
    assert.equal(await join(g, p.id), "removed");
    assert.match(await reason(vote(asGuest, g, p)), /Plan access required|Sign in to vote/);
  });
});

// ── scope: one plan, no account powers ─────────────────────────────────────
describe("what a guest cannot do", { skip: SKIP }, () => {
  test("cannot vote on, read, or listen to another plan; can on its own", async () => {
    const host = await account();
    const [mine, other] = [await plan(host), await plan(host)];
    const g = await anon();
    await join(g, mine.id);
    await vote(asGuest, g, mine); // positive control
    assert.match(await reason(vote(asGuest, g, other)), /Sign in to vote on this plan/);
    assert.equal(await n(`select count(*) from votes where plan_id = '${other.id}'`), "0");
    assert.equal(await asGuest(g, `select count(*) from plans where id = '${other.id}'`), "0");
    assert.equal(await asGuest(g, `select count(*) from plan_spots where plan_id = '${other.id}'`), "0");
    // realtime presence topics apply the same rule
    await psql(`insert into realtime.messages (topic, extension, payload, event) values
      ('plan:${mine.id}:presence','presence','{}','x'), ('plan:${other.id}:presence','presence','{}','x')`);
    const seen = await asGuest(g, `select set_config('realtime.topic','plan:${mine.id}:presence',true) is not null;
      select count(*) from realtime.messages where topic = 'plan:${mine.id}:presence'`);
    assert.ok(seen.endsWith("1"), `own presence topic readable: ${seen}`);
    const hidden = await asGuest(g, `select set_config('realtime.topic','plan:${other.id}:presence',true) is not null;
      select count(*) from realtime.messages where topic = 'plan:${other.id}:presence'`);
    assert.ok(hidden.endsWith("0"), `other presence topic hidden: ${hidden}`);
  });

  test("has no direct write path to votes, rsvps or ratings", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    for (const sql of [
      `insert into votes (plan_id,spot_id,voter_name,value,phase,pool_number,user_id) values ('${p.id}','${p.spots[0]}','x',true,'pool',1,'${g}')`,
      `insert into rsvps (plan_id,voter_name,user_id) values ('${p.id}','x','${g}')`,
      `insert into ratings (plan_id,spot_id,voter_name,stars,user_id) values ('${p.id}','${p.spots[0]}','x',5,'${g}')`,
    ]) assert.notEqual(await reason(asGuest(g, sql)), "NO ERROR", sql);
    await vote(asGuest, g, p); // positive control: the RPC path is open
  });

  test("account-only RPCs refuse it, each for the account reason", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    const pairs: [string, RegExp][] = [
      [`select claim_plan_access('${p.id}')`, /Sign in to join this plan/],
      [`select rate_plan('${p.id}','${p.spots[0]}','x',4,true,'${hash()}')`, /Sign in/],
      [`select unrate_plan('${p.id}')`, /Sign in/],
      [`select leave_plan('${p.id}')`, /Sign in/],
      [`select create_direct_plan('{"title":"x"}'::jsonb,'${p.spots[0]}')`, /permanent account is required/],
      [`select create_secure_plan('{"title":"x","category":"dinner"}'::jsonb, array[]::uuid[])`, /permanent account is required/],
      [`select set_time_availability('${p.id}','${randomUUID()}', true)`, /Plan access required/],
      [`select claim_booking('${p.id}')`, /Sign in|permanent|access/i],
    ];
    for (const [sql, re] of pairs) assert.match(await reason(asGuest(g, sql)), re, sql);
    // its own rows stay out of the account-only surfaces
    assert.equal(await asGuest(g, `select count(*) from people`), "0");
    assert.equal(await asGuest(g, `select count(*) from plan_time_options`), "0");
  });

  test("an expired guest reads nothing and votes nothing", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    await vote(asGuest, g, p); // positive control
    await psql(`update guest_sessions set expires_at = now() - interval '1 minute' where user_id = '${g}'`);
    assert.match(await reason(vote(asGuest, g, p, 1)), /Sign in to vote/);
    assert.equal(await asGuest(g, `select count(*) from plans where id = '${p.id}'`), "0");
    assert.equal(await join(g, p.id), "expired");
  });

  test("an anonymous session with no guest row (the pre-064 leftovers) stays inert", async () => {
    const p = await plan(await account());
    const old = await anon();
    await psql(`insert into plan_access (plan_id,user_id) values ('${p.id}','${old}')`);
    assert.match(await reason(vote(asGuest, old, p)), /Sign in to vote/);
    assert.equal(await asGuest(old, `select count(*) from plans where id = '${p.id}'`), "0");
  });

  test("guest_sessions itself is closed to clients", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    assert.notEqual(await reason(asGuest(g, `select count(*) from guest_sessions`)), "NO ERROR");
    assert.notEqual(await reason(asGuest(g, `update guest_sessions set plan_id = plan_id`)), "NO ERROR");
  });
});

// ── ballots ────────────────────────────────────────────────────────────────
describe("one ballot per guest per round", { skip: SKIP }, () => {
  test("voting twice, even for another place and with a new device hash, leaves one row", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    await vote(asGuest, g, p, 0);
    await vote(asGuest, g, p, 0);
    await vote(asGuest, g, p, 1);
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}' and user_id = '${g}'`), "1");
    assert.equal(await n(`select spot_id from votes where plan_id = '${p.id}' and user_id = '${g}'`), p.spots[1]);
  });

  test("a guest reply is one row too", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    for (const choice of ["maybe", "coming"]) {
      await asGuest(g, `select set_plan_rsvp('${p.id}','x',true,'${choice}','${hash()}')`);
    }
    assert.equal(await n(`select count(*) from rsvps where plan_id = '${p.id}' and user_id = '${g}'`), "1");
  });
});

// ── upgrade ────────────────────────────────────────────────────────────────
describe("merge_guest_into_me", { skip: SKIP }, () => {
  const token = async (g: string) => (await asGuest(g, `select issue_guest_merge_token()`)).split("\n")[0];
  const merge = async (uid: string, t: string) => JSON.parse(await asAccount(uid, `select merge_guest_into_me('${t}')`));

  test("moves the ballot and reply to the account once; repeating changes nothing", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id, "Sam");
    await vote(asGuest, g, p, 2);
    await asGuest(g, `select set_plan_rsvp('${p.id}','x',true,'coming','${hash()}')`);
    const t = await token(g);
    const me = await account();
    const first = await merge(me, t);
    assert.deepEqual([first.status, first.votes_moved, first.rsvps_moved], ["merged", 1, 1]);
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}' and user_id = '${me}'`), "1");
    assert.equal(await n(`select spot_id from votes where plan_id = '${p.id}' and user_id = '${me}'`), p.spots[2]);
    assert.equal(await n(`select count(*) from votes where user_id = '${g}'`), "0");
    assert.equal(await n(`select count(*) from rsvps where plan_id = '${p.id}' and user_id = '${me}'`), "1");
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${p.id}' and user_id = '${g}'`), "0");
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${p.id}' and user_id = '${me}'`), "1");
    const again = await merge(me, t);
    assert.equal(again.status, "already");
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}'`), "1");
    assert.equal(await n(`select count(*) from rsvps where plan_id = '${p.id}'`), "1");
  });

  test("an account that already voted the round keeps its own ballot; no double vote", async () => {
    const host = await account();
    const me = await account();
    const p = await plan(host);
    await psql(`insert into plan_access (plan_id,user_id) values ('${p.id}','${me}')`);
    await vote(asAccount, me, p, 0, "Me");
    const g = await anon();
    await join(g, p.id);
    await vote(asGuest, g, p, 1);
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}'`), "2");
    assert.equal((await merge(me, await token(g))).status, "merged");
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}'`), "1");
    assert.equal(await n(`select spot_id from votes where plan_id = '${p.id}' and user_id = '${me}'`), p.spots[0]);
  });

  test("the secret belongs to the first account that claims it; a merged guest can no longer vote", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    const t = await token(g);
    const [me, thief] = [await account(), await account()];
    await merge(me, t);
    assert.match(await reason(merge(thief, t)), /not valid/);
    assert.match(await reason(vote(asGuest, g, p)), /Sign in to vote/);
    assert.equal(await join(g, p.id), "merged");
  });

  test("a wrong token, a guest caller, and a removed account are refused", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    await join(g, p.id);
    const t = await token(g);
    const me = await account();
    assert.match(await reason(merge(me, randomBytes(32).toString("hex"))), /not valid/);
    assert.match(await reason(asGuest(g, `select merge_guest_into_me('${t}')`)), /Sign in to keep your votes/);
    await psql(`insert into plan_removed_members (plan_id,user_id) values ('${p.id}','${me}')`);
    assert.match(await reason(merge(me, t)), /host removed you/);
    await psql(`delete from plan_removed_members where user_id = '${me}'`);
    assert.equal((await merge(me, t)).status, "merged"); // positive control: same token works once cleared
  });

  test("an upgrade in place (same uid) is marked, not moved", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    const t = await token(g);
    await vote(asGuest, g, p);
    // the guest signs in without a new uid: the JWT turns permanent
    const res = JSON.parse(await asAccount(g, `select merge_guest_into_me('${t}')`));
    assert.equal(res.status, "linked");
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}' and user_id = '${g}'`), "1");
  });

  test("a merge into an account below the plan's age gate is refused and loses nothing", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    await vote(asGuest, g, p);
    const t = await token(g);
    const gatedSpot = await spot(21);
    await psql(`insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ('${p.id}','${gatedSpot}',1,false)`);
    const teen = await account();
    await psql(`update member_ages set date_of_birth = (current_date - interval '15 years')::date where user_id = '${teen}'`);
    const msg = await reason(merge(teen, t));
    assert.match(msg, /ages 21 and up|date of birth/);
    assert.equal(await n(`select count(*) from votes where plan_id = '${p.id}' and user_id = '${g}'`), "1");
  });
});

// ── abuse limits ───────────────────────────────────────────────────────────
describe("consume_guest_limit", { skip: SKIP }, () => {
  const limit = (subject: string, secret = SECRET) => psql(`select consume_guest_limit('${secret}','${subject}')`);

  test("10 a minute per subject, then refused; another subject is unaffected", async () => {
    const [a, b] = [`t-${randomUUID()}`, `t-${randomUUID()}`];
    const answers: string[] = [];
    for (let i = 0; i < 11; i++) answers.push(await limit(a));
    assert.deepEqual(answers.slice(0, 10), Array(10).fill("t"));
    assert.equal(answers[10], "f");
    assert.equal(await limit(b), "t");
  });

  test("a wrong secret raises instead of answering", async () => {
    assert.match(await reason(limit("x", "wrong")), /Server authorization required/);
  });
});

// ── security review fixes ───────────────────────────────────────────────────
describe("global ceiling and cap accounting", { skip: SKIP }, () => {
  const globalCount = async () =>
    Number(await psql(`select coalesce(sum(request_count),0) from app_rate_limits where scope = 'guest-join-global'`));

  test("consume_guest_limit never spends the global ceiling; only a minted guest does", async () => {
    const before = await globalCount();
    for (let i = 0; i < 5; i++) await psql(`select consume_guest_limit('${SECRET}','g-${randomUUID()}')`);
    assert.equal(await globalCount(), before);
    const host = await account();
    const [gated, plain] = [await plan(host, 21), await plan(host)];
    const g = await anon();
    assert.equal(await join(g, gated.id), "age_gated");
    assert.equal(await globalCount(), before); // a refused join spends nothing
    assert.equal(await join(g, plain.id), "joined");
    assert.equal(await globalCount(), before + 1);
    assert.equal(await join(g, plain.id), "already");
    assert.equal(await globalCount(), before + 1); // re-entry spends nothing
  });

  test("at the ceiling a new guest is told 'limited' and gets no access", async () => {
    const p = await plan(await account());
    await psql(`insert into app_rate_limits values ('guest-join-global','global',date_trunc('day',now()),800)
      on conflict (scope,subject,window_start) do update set request_count = 800`);
    const g = await anon();
    assert.equal(await join(g, p.id), "limited");
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${p.id}' and user_id = '${g}'`), "0");
    await psql(`delete from app_rate_limits where scope = 'guest-join-global'`);
    assert.equal(await join(g, p.id), "joined"); // positive control once the counter is cleared
  });

  test("removing a guest frees its slot: fill to the cap, remove one, a new guest joins", async () => {
    const host = await account();
    const p = await plan(host);
    const guests = await Promise.all(Array.from({ length: 21 }, anon));
    for (const g of guests.slice(0, 20)) assert.equal(await join(g, p.id), "joined");
    assert.equal(await join(guests[20], p.id), "full");
    const seat = createHash("md5").update(`${p.id}:${guests[0]}`).digest("hex");
    assert.equal(JSON.parse(await asAccount(host, `select remove_plan_member('${p.id}','${seat}')`)).result, "removed");
    assert.equal(await n(`select expires_at <= now() from guest_sessions where user_id = '${guests[0]}'`), "t");
    assert.equal(await join(guests[20], p.id), "joined");
    assert.equal(await join(guests[0], p.id), "removed");
  });

  test("the cap counts only guests that still hold access", async () => {
    const p = await plan(await account());
    const guests = await Promise.all(Array.from({ length: 21 }, anon));
    for (const g of guests.slice(0, 20)) await join(g, p.id);
    await psql(`delete from plan_access where plan_id = '${p.id}' and user_id = '${guests[3]}'`);
    assert.equal(await join(guests[20], p.id), "joined");
  });
});

describe("removed guests and guest accounts", { skip: SKIP }, () => {
  test("a guest the host removed cannot come back by signing in and merging", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    await join(g, p.id);
    const t = (await asGuest(g, `select issue_guest_merge_token()`)).split("\n")[0];
    const seat = createHash("md5").update(`${p.id}:${g}`).digest("hex");
    await asAccount(host, `select remove_plan_member('${p.id}','${seat}')`);
    const me = await account();
    assert.match(await reason(asAccount(me, `select merge_guest_into_me('${t}')`)), /host removed you/);
    assert.equal(await n(`select count(*) from plan_access where plan_id = '${p.id}' and user_id = '${me}'`), "0");
    // positive control: an unremoved guest's merge works
    const g2 = await anon();
    await join(g2, p.id);
    const t2 = (await asGuest(g2, `select issue_guest_merge_token()`)).split("\n")[0];
    assert.equal(JSON.parse(await asAccount(me, `select merge_guest_into_me('${t2}')`)).status, "merged");
  });

  test("a guest cannot delete an account; a permanent account still can", async () => {
    const p = await plan(await account());
    const g = await anon();
    await join(g, p.id);
    assert.match(await reason(asGuest(g, `select delete_my_account(false)`)), /Sign in required/);
    assert.equal(await n(`select count(*) from guest_sessions where user_id = '${g}'`), "1");
    const me = await account();
    assert.notEqual(await reason(asAccount(me, `select delete_my_account(true)`)), "Sign in required");
  });
});

describe("lock order", { skip: SKIP }, () => {
  const tokenOf = async (g: string) => (await asGuest(g, `select issue_guest_merge_token()`)).split("\n")[0];
  const settle = (ps: Promise<unknown>[]) => Promise.allSettled(ps);
  const noDeadlock = (rs: PromiseSettledResult<unknown>[]) =>
    assert.deepEqual(rs.filter((r) => r.status === "rejected" && /deadlock/i.test(String((r as PromiseRejectedResult).reason))), []);

  test("a merge and a removal that overlap in time do not deadlock (removal's order, held open)", async () => {
    const host = await account();
    const p = await plan(host);
    const g = await anon();
    await join(g, p.id);
    const t = await tokenOf(g);
    const me = await account();
    // remove_plan_member's lock order -- the plan, then the guest row -- held open half a second
    const removal = psql(`begin; select 1 from plans where id = '${p.id}' for update; select pg_sleep(0.6);
      update guest_sessions set expires_at = now() where user_id = '${g}'; commit;`);
    await new Promise((r) => setTimeout(r, 250));
    const merge = asAccount(me, `select merge_guest_into_me('${t}')`);
    const rs = await settle([removal, merge]);
    noDeadlock(rs);
    assert.deepEqual(rs.map((r) => r.status), ["fulfilled", "fulfilled"]);
  });

  test("the real removal and merge, raced several times, never deadlock", async () => {
    const host = await account();
    for (let i = 0; i < 6; i++) {
      const p = await plan(host);
      const g = await anon();
      await join(g, p.id);
      const t = await tokenOf(g);
      const me = await account();
      const seat = createHash("md5").update(`${p.id}:${g}`).digest("hex");
      const rs = await settle([
        asAccount(host, `select remove_plan_member('${p.id}','${seat}')`),
        asAccount(me, `select merge_guest_into_me('${t}')`),
      ]);
      noDeadlock(rs);
      assert.equal(rs[0].status, "fulfilled", `removal ${i}`);
      // the merge either won (merged) or lost cleanly (the host removed you)
      if (rs[1].status === "rejected") assert.match(String(rs[1].reason), /host removed you|not valid/);
    }
  });
});
