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
  // Users before spots: deleting a user cascades its people row and visits,
  // and 065 refuses to delete a spot someone has visited.
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
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

  test("the label is always the claimer's own name, never text naming someone else", async () => {
    const host = await user();
    await psql(`insert into people (id, display_name, auth_user_id) values ('${host}', 'Hana', '${host}')`);
    const p = await plan(host, "now() + interval '1 day'");
    await command(host, p.id, p.token, '{"booking_owner": "Kim"}');
    assert.equal(await owner(p.id), "Hana");
    await psql(`delete from people where id = '${host}'`);
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

// ── P11 ─────────────────────────────────────────────────────────────────────
describe("069 rating only after the outing (P11)", { skip: SKIP }, () => {
  /** A decided one-pool plan; the members get a people row and plan access. */
  async function decided(members: string[]): Promise<{ id: string; winner: string }> {
    const host = await user();
    const p = await plan(host, "now() + interval '1 day'", members);
    for (const u of members) await psql(`insert into people (id, display_name, auth_user_id) values ('${u}', 'QA-${u.slice(0, 6)}', '${u}')`);
    const cmd = (c: string) => as(host, `select execute_plan_command('${p.id}', '${p.token}', '${c}', '{}'::jsonb)`);
    await cmd("advance");
    const { winner_spot_id } = JSON.parse(await cmd("decide"));
    return { id: p.id, winner: winner_spot_id };
  }
  const rate = (uid: string, planId: string, spot: string) =>
    as(uid, `select rate_plan('${planId}','${spot}','x',4,true,'${hash()}')`);
  const TOO_EARLY = /Rating opens after the outing/;

  test("with a time set, rating opens only once it has passed", async () => {
    const m = await user();
    const d = await decided([m]);
    await psql(`update plans set event_time = now() + interval '1 hour' where id = '${d.id}'`);
    await assert.rejects(rate(m, d.id, d.winner), TOO_EARLY);
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${d.id}'`);
    await rate(m, d.id, d.winner);
  });

  test("with no time set, rating opens 3 hours after deciding (decided_at is stamped)", async () => {
    const m = await user();
    const d = await decided([m]);
    assert.equal(await psql(`select decided_at > now() - interval '1 minute' from plans where id = '${d.id}'`), "t");
    await assert.rejects(rate(m, d.id, d.winner), TOO_EARLY);
    await psql(`update plans set decided_at = now() - interval '4 hours' where id = '${d.id}'`);
    await rate(m, d.id, d.winner);
  });

  test("unrating removes the caller's own photo-less visit, and nothing else", async () => {
    const [a, b, c] = [await user(), await user(), await user()];
    const d = await decided([a, b, c]);
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${d.id}'`);
    const visit = (u: string) => psql(`insert into visits (person_id, spot_id, plan_id) values ('${u}','${d.winner}','${d.id}') returning id`);
    const [va, vb] = [await visit(a), await visit(b)];
    await visit(c);
    await psql(`insert into visit_photos (visit_id, person_id, storage_path) values ('${vb}','${b}','${b}/${vb}/1.jpg')`);
    for (const u of [a, b]) await rate(u, d.id, d.winner);

    const outA = JSON.parse(await as(a, `select unrate_plan('${d.id}')`));
    assert.deepEqual([outA.result, outA.visit_removed], ["removed", true]);
    const outB = JSON.parse(await as(b, `select unrate_plan('${d.id}')`));
    assert.deepEqual([outB.result, outB.visit_removed], ["removed", false]);
    const left = await psql(`select string_agg(person_id::text, ',' order by person_id) from visits where plan_id = '${d.id}'`);
    assert.equal(left, [b, c].sort().join(","));
    assert.equal(await psql(`select count(*) from visits where id = '${va}'`), "0");
  });
});

// ── seat_key ────────────────────────────────────────────────────────────────
describe("069 one seat per account per plan (seat_key)", { skip: SKIP }, () => {
  test("two devices of one account share a seat; another account has its own; members can read it", async () => {
    const [a, b] = [await user(), await user()];
    const p = await plan(await user(), "now() + interval '1 day'", [a, b]);
    // Device 1 votes, device 2 replies: two different participant hashes.
    await as(a, `select cast_plan_vote('${p.id}','${p.spots[0]}','A',true,'pool',1::smallint,'${hash()}')`);
    await as(a, `select set_plan_rsvp('${p.id}','A',true,'coming','${hash()}')`);
    await as(b, `select cast_plan_vote('${p.id}','${p.spots[1]}','B',true,'pool',1::smallint,'${hash()}')`);

    // Read as member B: the column is granted, user_id is not needed.
    const seats = await as(b, `select
      (select count(distinct participant_token_hash) from (
         select participant_token_hash from votes where plan_id='${p.id}' and voter_name='A'
         union all select participant_token_hash from rsvps where plan_id='${p.id}' and voter_name='A') d) || ',' ||
      (select count(distinct seat_key) from (
         select seat_key from votes where plan_id='${p.id}' and voter_name='A'
         union all select seat_key from rsvps where plan_id='${p.id}' and voter_name='A') s) || ',' ||
      (select count(distinct seat_key) from votes where plan_id='${p.id}')`);
    assert.equal(seats, "2,1,2"); // two devices, one seat; two accounts, two seats

    const mine = JSON.parse(await as(a, `select my_plan_rows('${p.id}')`));
    assert.equal(mine.seat_key, await psql(`select seat_key from votes where plan_id='${p.id}' and user_id='${a}'`));
  });
});

// ── P15 ─────────────────────────────────────────────────────────────────────
describe("069 the host can cancel a decided plan (P15)", { skip: SKIP }, () => {
  async function decidedPlan(members: string[] = []) {
    const host = await user();
    const p = await plan(host, "now() + interval '1 day'", members);
    const cmd = (c: string) => as(host, `select execute_plan_command('${p.id}', '${p.token}', '${c}', '{}'::jsonb)`);
    await cmd("advance");
    const { winner_spot_id } = JSON.parse(await cmd("decide"));
    return { host, p, winner: winner_spot_id as string };
  }
  const del = async (uid: string, planId: string, token: string) =>
    JSON.parse(await as(uid, `select delete_plan('${planId}', '${token}')`)).result;
  const exists = (planId: string) => psql(`select count(*) from plans where id = '${planId}'`);

  test("a decided plan that hasn't happened can be cancelled, even when booked", async () => {
    const { host, p } = await decidedPlan();
    await psql(`update plans set booked = true where id = '${p.id}'`);
    assert.equal(await del(host, p.id, p.token), "deleted");
    assert.equal(await exists(p.id), "0");
  });

  test("once rated or visited it is history: already_happened", async () => {
    const rater = await user();
    const rated = await decidedPlan([rater]);
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${rated.p.id}'`);
    await as(rater, `select rate_plan('${rated.p.id}','${rated.winner}','R',5,true,'${hash()}')`);
    assert.equal(await del(rated.host, rated.p.id, rated.p.token), "already_happened");

    const visitor = await user(); // a member from before the decision (only those count, 069)
    const visited = await decidedPlan([visitor]);
    await psql(`insert into people (id, display_name, auth_user_id) values ('${visitor}', 'V', '${visitor}');
      insert into visits (person_id, spot_id, plan_id) values ('${visitor}', '${visited.winner}', '${visited.p.id}')`);
    assert.equal(await del(visited.host, visited.p.id, visited.p.token), "already_happened");
    assert.equal(await exists(visited.p.id), "1");
  });

  test("only the host can cancel it", async () => {
    const member = await user();
    const { p } = await decidedPlan([member]);
    assert.equal(await del(member, p.id, p.token), "not_host");
    assert.equal(await exists(p.id), "1");
  });
});

// ── security review follow-ups ───────────────────────────────────────────────
describe("069 security review: visits, unrate, booking backfill", { skip: SKIP }, () => {
  async function decidedWith(members: string[]) {
    const host = await user();
    const p = await plan(host, "now() + interval '1 day'", members);
    for (const u of members) await psql(`insert into people (id, display_name, auth_user_id) values ('${u}', 'QA-${u.slice(0, 6)}', '${u}')`);
    const cmd = (c: string) => as(host, `select execute_plan_command('${p.id}', '${p.token}', '${c}', '{}'::jsonb)`);
    await cmd("advance");
    const { winner_spot_id } = JSON.parse(await cmd("decide"));
    return { host, p, winner: winner_spot_id as string };
  }
  const logVisit = (uid: string, spot: string, planId: string | null) =>
    as(uid, `insert into visits (person_id, spot_id, plan_id) values ('${uid}', '${spot}', ${planId ? `'${planId}'` : "null"})`);

  test("a visit pinned to a plan needs membership and a past outing", async () => {
    const [member, stranger] = [await user(), await user()];
    const d = await decidedWith([member]);
    await psql(`insert into people (id, display_name, auth_user_id) values ('${stranger}', 'S', '${stranger}')`);
    await assert.rejects(logVisit(stranger, d.winner, d.p.id), /row-level security/); // not a member
    await assert.rejects(logVisit(member, d.winner, d.p.id), /row-level security/);   // outing not yet
    await logVisit(member, d.winner, null);                                            // no plan: fine
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${d.p.id}'`);
    await logVisit(member, d.winner, d.p.id);                                          // the real thing
    assert.equal(await psql(`delete from visits where person_id = '${stranger}' returning 1`), "");
  });

  test("unrate spares a visit with a note, and removes nothing without a rating", async () => {
    const [noted, unrated] = [await user(), await user()];
    const d = await decidedWith([noted, unrated]);
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${d.p.id}'`);
    await psql(`insert into visits (person_id, spot_id, plan_id, note) values ('${noted}', '${d.winner}', '${d.p.id}', 'great night');
      insert into visits (person_id, spot_id, plan_id) values ('${unrated}', '${d.winner}', '${d.p.id}')`);
    await as(noted, `select rate_plan('${d.p.id}','${d.winner}','x',5,true,'${hash()}')`);
    assert.equal(JSON.parse(await as(noted, `select unrate_plan('${d.p.id}')`)).visit_removed, false);
    assert.equal(JSON.parse(await as(unrated, `select unrate_plan('${d.p.id}')`)).visit_removed, false);
    assert.equal(await psql(`select count(*) from visits where plan_id = '${d.p.id}'`), "2");
  });

  test("applying 069 backfills the booking claims hosts already made", async () => {
    const host = await user();
    const p = await plan(host, "now() + interval '1 day'");
    const migration = new URL("../supabase/migration-069-plan-lifecycle.sql", import.meta.url).pathname;
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-c", `begin; update plans set booking_owner = 'Hana' where id = '${p.id}'; delete from plan_booking_owners where plan_id = '${p.id}';`,
      "-f", migration,
      "-c", `select user_id from plan_booking_owners where plan_id = '${p.id}'`,
      "-c", "rollback"], { timeout: 60000 });
    assert.equal(stdout.trim().split("\n").filter(Boolean).pop(), host);
  });
});

// ── late joiners (069 follow-up) ─────────────────────────────────────────────
describe("069 a late link-holder can't lock the host out", { skip: SKIP }, () => {
  async function decidedPlan(members: string[]) {
    const host = await user();
    const p = await plan(host, "now() + interval '1 day'", members);
    const cmd = (c: string) => as(host, `select execute_plan_command('${p.id}', '${p.token}', '${c}', '{}'::jsonb)`);
    await cmd("advance");
    const { winner_spot_id } = JSON.parse(await cmd("decide"));
    return { host, p, winner: winner_spot_id as string };
  }
  const visit = async (uid: string, planId: string, spot: string) => {
    await psql(`insert into people (id, display_name, auth_user_id) values ('${uid}', 'V', '${uid}') on conflict do nothing`);
    await as(uid, `insert into visits (person_id, spot_id, plan_id) values ('${uid}', '${spot}', '${planId}')`);
  };
  const cancel = async (d: { host: string; p: Plan }) =>
    JSON.parse(await as(d.host, `select delete_plan('${d.p.id}', '${d.p.token}')`)).result;

  test("a visit from someone who joined after the decision doesn't block cancelling", async () => {
    const d = await decidedPlan([]);
    const late = await user();
    await psql(`insert into plan_access (plan_id, user_id) values ('${d.p.id}', '${late}');
      update plans set event_time = now() - interval '1 hour' where id = '${d.p.id}'`);
    await visit(late, d.p.id, d.winner);
    assert.equal(await cancel(d), "deleted");
  });

  test("a visit from a member who was there before the decision does (control)", async () => {
    const early = await user();
    const d = await decidedPlan([early]);
    await psql(`update plans set event_time = now() - interval '1 hour' where id = '${d.p.id}'`);
    await visit(early, d.p.id, d.winner);
    assert.equal(await cancel(d), "already_happened");
  });

  test("legacy decided plans get decided_at from their last vote, not their creation", async () => {
    const voter = await user();
    const p = await plan(await user(), "now() + interval '1 day'", [voter]);
    await as(voter, `select cast_plan_vote('${p.id}','${p.spots[0]}','V',true,'pool',1::smallint,'${hash()}')`);
    const migration = new URL("../supabase/migration-069-plan-lifecycle.sql", import.meta.url).pathname;
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-c", `begin; alter table plans disable trigger plans_stamp_decided_at;
             update plans set status = 'decided', stage = 'decided', decided_at = null, winner_spot_id = '${p.spots[0]}' where id = '${p.id}';
             alter table plans enable trigger plans_stamp_decided_at;`,
      "-f", migration,
      "-c", `select (decided_at = (select max(created_at) from votes where plan_id = '${p.id}'))::text from plans where id = '${p.id}'`,
      "-c", "rollback"], { timeout: 60000 });
    assert.equal(stdout.trim().split("\n").filter(Boolean).pop(), "true");
  });
});
