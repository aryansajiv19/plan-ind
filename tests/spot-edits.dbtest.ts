// Migration 082 -- a custom spot in a plan keeps its details; authenticated
// updates only name/area/visibility; anon holds nothing on zero-policy tables.
// Each test fails against a pre-082 database (no skip gate). Everything it
// creates is swept in `after`. NEVER point TEST_DATABASE_URL at the live project.
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

const made = { users: [] as string[], plans: [] as string[], spots: [] as string[] };
async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA-${randomBytes(3).toString("hex")}', '${uid}');`);
  made.users.push(uid);
  return uid;
}
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
/** A custom spot owned by uid; `inPlan` also deals it into a plan. */
async function spot(uid: string, inPlan: boolean): Promise<string> {
  const id = randomUUID();
  await psql(`insert into spots (id, name, area, cuisine, price_band, min_spend, open_till, vibe, source, visibility, created_by_user_id, category)
    values ('${id}', 'QA082 place', 'Marina', 'Custom place', '$$', 0, '', 'x', 'custom', 'private', '${uid}', 'dinner')`);
  made.spots.push(id);
  if (inPlan) {
    const plan = randomUUID();
    await psql(`insert into plans (id, title, category, area, status, stage, pool_count, created_by_user_id) values ('${plan}', 'QA082', 'dinner', 'Dubai', 'open', 'pool', 3, '${uid}');
      insert into plan_host_tokens (plan_id, token_hash) values ('${plan}', '${createHash("sha256").update(randomBytes(16)).digest("hex")}');
      insert into plan_spots (plan_id, spot_id, pool_number, advanced) values ('${plan}', '${id}', 1, false);`);
    made.plans.push(plan);
  }
  return id;
}
const patch = (uid: string, id: string, set: string) =>
  as(uid, `with x as (update spots set ${set} where id = '${id}' returning 1) select count(*) from x`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.plans.length) await psql(`delete from plans where id in (${ids(made.plans)})`);
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
  if (made.users.length) await psql(`delete from auth.users where id in (${ids(made.users)})`);
});

describe("082 spot edits and anon grants", { skip: SKIP }, () => {
  test("a place in a plan can't be renamed or re-categorised by its owner, but can go private or public", async () => {
    const a = await user();
    const id = await spot(a, true);
    await assert.rejects(patch(a, id, "name = 'Swapped'"), /part of a plan, so its details can't change/);
    // category isn't in the owner's column grant at all, so it fails even earlier.
    await assert.rejects(patch(a, id, "category = 'nightlife'"), /permission denied|part of a plan/);
    await assert.rejects(psql(`update spots set category = 'nightlife' where id = '${id}'`), /part of a plan/, "the trigger holds even for the owner role");
    assert.equal(await patch(a, id, "visibility = 'community'"), "1");
    assert.equal(await patch(a, id, "name = 'QA082 place', area = 'Marina', visibility = 'private'"), "1", "unchanged details pass (the UI sends all three)");
  });

  test("a place in no plan is still the owner's to rename; columns outside the grant are refused", async () => {
    const a = await user();
    const id = await spot(a, false);
    assert.equal(await patch(a, id, "name = 'Renamed', area = 'JBR'"), "1");
    await assert.rejects(patch(a, id, "latitude = 25.1"), /permission denied/);
    await assert.rejects(patch(a, id, "category = 'cafe'"), /permission denied/);
  });

  test("anon holds no privileges on the zero-policy tables", async () => {
    for (const table of ["member_ages", "app_rate_limits", "security_events", "friend_invites", "plan_host_tokens"]) {
      for (const privilege of ["select", "insert", "update", "delete"]) {
        assert.equal(await psql(`select has_table_privilege('anon', '${table}', '${privilege}')`), "f", `${table} ${privilege}`);
      }
    }
  });
});
