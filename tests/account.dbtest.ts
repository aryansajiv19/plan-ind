// P34: account RPCs that had no test at any tier -- delete_my_account (probe,
// leftover photos, what goes and what stays) and the friend-invite RPCs.
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
const made = { plans: [] as string[], spots: [] as string[], users: [] as string[] };
const hash = () => randomBytes(32).toString("hex");

async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA-${uid.slice(0, 6)}', '${uid}');
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');`);
  made.users.push(uid);
  return uid;
}

type Plan = { id: string; spots: string[] };
/** An open one-pool plan of three; the creator and members get plan_access. */
async function plan(creator: string, members: string[] = []): Promise<Plan> {
  const id = randomUUID();
  const spots = [randomUUID(), randomUUID(), randomUUID()];
  await psql(`
    insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ${spots.map((s) => `('${s}','QA-P34','dinner','Dubai','Test','$$',100,'12am','test')`).join(",")};
    insert into plans (id,title,category,area,deadline,status,stage,pool_count,budget_per_person,created_by_user_id)
      values ('${id}','QA-P34 plan','dinner','Dubai',now() + interval '1 day','open','pool',1,200,'${creator}');
    insert into plan_spots (plan_id,spot_id,pool_number,advanced) values ${spots.map((s) => `('${id}','${s}',1,false)`).join(",")};
    insert into plan_host_tokens (plan_id,token_hash) values ('${id}','${createHash("sha256").update(hash()).digest("hex")}');
    insert into plan_access (plan_id,user_id) values ${[creator, ...members].map((u) => `('${id}','${u}')`).join(",")};`);
  made.plans.push(id);
  made.spots.push(...spots);
  return { id, spots };
}
const decide = (p: Plan) =>
  psql(`update plans set status = 'decided', stage = 'decided', winner_spot_id = '${p.spots[0]}' where id = '${p.id}'`);

const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const vote = (uid: string, p: Plan) =>
  as(uid, `select cast_plan_vote('${p.id}','${p.spots[0]}','QA',true,'pool',1::smallint,'${hash()}')`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) await psql(`set storage.allow_delete_query = 'true';
    delete from storage.objects where bucket_id = 'visit-photos' and owner_id in (${ids(made.users)})`);
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

// ── delete_my_account ───────────────────────────────────────────────────────
describe("delete_my_account", { skip: SKIP }, () => {
  const remove = async (uid: string, probe = false) => JSON.parse(await as(uid, `select delete_my_account(${probe})`));

  test("the probe answers ready and removes nothing", async () => {
    const uid = await user();
    assert.equal((await remove(uid, true)).result, "ready");
    assert.equal(await psql(`select count(*) from auth.users where id = '${uid}'`), "1");
  });

  test("a photo left in the account's folder stops it before anything is deleted", async () => {
    const uid = await user();
    const p = await plan(uid);
    await psql(`insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('visit-photos', '${uid}/v/1.jpg', '${uid}', '{"size": 1}')`);
    const out = await remove(uid);
    assert.deepEqual([out.result, out.files], ["storage_remaining", 1]);
    assert.equal(await psql(`select (select count(*) from plans where id = '${p.id}') + (select count(*) from auth.users where id = '${uid}')`), "2");
  });

  test("hosted open plans go, a decided plan others joined stays hostless, ballots on others' decided plans are anonymised", async () => {
    const [me, other] = [await user(), await user()];
    const myOpen = await plan(me, [other]); // open: goes even though someone joined
    const myDecided = await plan(me, [other]);
    await decide(myDecided);
    const theirOpen = await plan(other, [me]);
    const theirDecided = await plan(other, [me]);
    await vote(me, theirOpen);
    await vote(me, theirDecided);
    await decide(theirDecided);
    const custom = randomUUID();
    await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,source,visibility,created_by_user_id)
        values ('${custom}','QA-P34 custom','dinner','Dubai','Custom place','$$',0,'Flexible','note','custom','private','${me}');
      insert into friendships (person_id, friend_id) values ('${me}', '${other}');`);
    made.spots.push(custom);

    const out = await remove(me);
    assert.deepEqual(
      [out.result, out.plans_deleted, out.plans_kept, out.votes_anonymised, out.spots_deleted, out.spots_orphaned],
      ["deleted", 1, 1, 1, 1, 0]);
    assert.equal(await psql(`select concat_ws('|',
        (select count(*) from plans where id = '${myOpen.id}'),
        (select count(*) from plans where id = '${myDecided.id}'),
        (select count(*) from plan_host_tokens where plan_id = '${myDecided.id}'),
        (select count(*) from votes where plan_id = '${theirOpen.id}'),
        (select voter_name || ':' || coalesce(user_id::text, 'no-account') from votes where plan_id = '${theirDecided.id}'),
        (select count(*) from friendships where '${me}' in (person_id, friend_id)),
        (select count(*) from spots where id = '${custom}'),
        (select count(*) from auth.users where id = '${me}'))`),
      "0|1|0|0|Former member:no-account|0|0|0");
  });
});

// ── friend invites ──────────────────────────────────────────────────────────
describe("friend invites", { skip: SKIP }, () => {
  const invite = async (uid: string) => JSON.parse(await as(uid, "select create_friend_invite()")).token as string;
  const preview = async (uid: string, token: string) => JSON.parse(await as(uid, `select preview_friend_invite('${token}')`));
  const redeem = async (uid: string, token: string) => JSON.parse(await as(uid, `select redeem_friend_invite('${token}')`)).result;

  test("an invite previews its inviter, makes friends both ways once, and is spent", async () => {
    const [a, b, c] = [await user(), await user(), await user()];
    await plan(a, [b]);
    const token = await invite(a);
    assert.equal((await preview(a, token)).result, "self");
    const seen = await preview(b, token);
    assert.deepEqual([seen.result, seen.display_name, seen.shared_plans], ["valid", `QA-${a.slice(0, 6)}`, 1]);
    assert.equal((await preview(b, "not-a-token")).result, "invalid");
    assert.equal(await redeem(a, token), "self");
    assert.equal(await redeem(b, token), "friends");
    assert.equal(await psql(`select count(*) from friendships where (person_id, friend_id) in (('${a}','${b}'),('${b}','${a}'))`), "2");
    assert.equal(await redeem(c, token), "invalid"); // spent
    assert.equal(await redeem(b, await invite(a)), "already_friends");
  });

  test("an expired invite is invalid, and an account holds at most 20 open ones", async () => {
    const [a, b] = [await user(), await user()];
    const stale = await invite(a);
    await psql(`update friend_invites set expires_at = now() - interval '1 minute' where inviter_id = '${a}'`);
    assert.equal((await preview(b, stale)).result, "invalid");
    assert.equal(await redeem(b, stale), "invalid");
    for (let i = 0; i < 20; i++) await invite(a);
    await assert.rejects(invite(a), /Too many open invites/);
  });
});
