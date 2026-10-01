// Integration tests for migration 100 (group preferences) against a LOCAL
// Supabase Postgres. NEVER point TEST_DATABASE_URL at the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

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

const SKIP = await psql("select to_regclass('public.plan_preferences') is not null").then(
  (out) => out === "t" ? false as const : "plan_preferences is missing: apply migration 100 to this LOCAL database",
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[] };

async function user(name = "QA098"): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into member_ages (user_id, date_of_birth) values ('${uid}', '1990-01-01');
    insert into people (id, display_name, auth_user_id) values ('${uid}', '${name}', '${uid}');`);
  made.users.push(uid);
  return uid;
}
async function places(n: number): Promise<string[]> {
  const ids = Array.from({ length: n }, () => randomUUID());
  for (const id of ids) {
    await psql(`insert into spots (id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, source)
      values ('${id}','QA098 place','dinner','Jumeirah','Test','$$',100,'11pm','QA','curated')`);
  }
  made.spots.push(...ids);
  return ids;
}
const as = (uid: string, sql: string, anonymous = false) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":${anonymous}}'; set role authenticated; ${sql}`);
const arr = (xs: string[]) => `array[${xs.map((x) => `'${x}'`).join(",")}]::uuid[]`;

async function gathering(host: string): Promise<string> {
  const out = await as(host, `select create_gathering_plan('{"title":"QA098 night","category":"dinner"}'::jsonb)`);
  return (JSON.parse(out.split("\n").pop()!) as { id: string }).id;
}
async function join(plan: string, uid: string) {
  await psql(`insert into plan_access (plan_id, user_id) values ('${plan}','${uid}')`);
}
const prefs = (uid: string, plan: string, budget = "150", origin = "'marina'", vibes = "array['chill']", avoid = "'{}'") =>
  as(uid, `select set_plan_preferences('${plan}', ${budget}, ${origin}, ${vibes}::text[], ${avoid}::text[])`);
const lastJson = (s: string) => JSON.parse(s.split("\n").pop()!) as Record<string, unknown>;

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) {
    await psql(`delete from plans where created_by_user_id in (${ids(made.users)})`);
    await psql(`delete from auth.users where id in (${ids(made.users)})`);
  }
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
});

describe("100 create_gathering_plan", { skip: SKIP }, () => {
  test("a permanent host gets a gathering plan with no places, hosted and joined; an anonymous session is refused", async () => {
    const host = await user();
    const plan = await gathering(host);
    assert.equal(
      await psql(`select stage||'/'||status||'/'||pool_count||'/'||(select count(*) from plan_spots where plan_id=p.id)||'/'||(select count(*) from plan_access where plan_id=p.id and user_id='${host}') from plans p where id='${plan}'`),
      "gathering/open/3/0/1",
    );
    const anon = await user("Guesty");
    await assert.rejects(
      () => as(anon, `select create_gathering_plan('{"title":"QA098","category":"dinner"}'::jsonb)`, true),
      /permanent account is required/,
    );
    await assert.rejects(
      () => as(host, `select create_gathering_plan('{"title":"QA098","category":"dinner","area":"x"}'::jsonb)`),
      /Unsupported plan fields/,
    );
    assert.equal(await psql(`select count(*) from plans where created_by_user_id='${anon}'`), "0");
  });
});

describe("100 set_plan_preferences and RLS", { skip: SKIP }, () => {
  test("a member upserts their own row, name from the profile; a non-member can neither read nor write", async () => {
    const host = await user("Hosty");
    const friend = await user("Friendy");
    const stranger = await user("Strangy");
    const plan = await gathering(host);
    await join(plan, friend);

    assert.equal(lastJson(await prefs(friend, plan)).result, "saved");
    assert.equal(lastJson(await prefs(friend, plan, "200", "'jvc'")).result, "saved", "re-save is an update");
    assert.equal(
      await psql(`select count(*)||'/'||max(voter_name)||'/'||max(budget_cap)||'/'||max(origin_value)||'/'||round(max(origin_latitude)::numeric,2) from plan_preferences where plan_id='${plan}' and user_id='${friend}'`),
      "1/Friendy/200/jvc/25.06",
    );

    await assert.rejects(() => prefs(stranger, plan), /Plan access required/);
    assert.equal(await as(stranger, `select count(*) from plan_preferences where plan_id='${plan}'`), "0");
    assert.equal(await as(friend, `select count(*) from plan_preferences where plan_id='${plan}'`), "1", "positive control: a member sees the row");
    assert.equal(await psql(`select count(*) from plan_preferences where plan_id='${plan}'`), "1", "the refused write left nothing");
  });

  test("no direct write works for anyone, and one member's rows are invisible to another plan's members", async () => {
    const host = await user();
    const friend = await user();
    const other = await user();
    const plan = await gathering(host);
    const otherPlan = await gathering(other);
    await join(plan, friend);
    await prefs(friend, plan);
    await prefs(other, otherPlan);

    for (const sql of [
      `insert into plan_preferences (plan_id, user_id, voter_name) values ('${plan}','${friend}','x')`,
      `update plan_preferences set budget_cap = 1 where plan_id='${plan}'`,
      `delete from plan_preferences where plan_id='${plan}'`,
    ]) await assert.rejects(() => as(friend, sql), /permission denied/);
    assert.equal(await as(host, `select count(*) from plan_preferences where plan_id='${plan}'`), "1");
    assert.equal(await as(host, `select count(*) from plan_preferences where plan_id='${otherPlan}'`), "0", "RLS shows only your plan's rows");
    assert.equal(await as(other, `select count(*) from plan_preferences where plan_id='${otherPlan}'`), "1");
  });

  test("out-of-range budget, oversized arrays, unknown origin and junk items are refused", async () => {
    const host = await user();
    const plan = await gathering(host);
    await assert.rejects(() => prefs(host, plan, "10001"), /Invalid budget/);
    await assert.rejects(() => prefs(host, plan, "-1"), /Invalid budget/);
    await assert.rejects(() => prefs(host, plan, "100", "'atlantis-bar'"), /Unknown starting point/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['chill','lively','quiet']"), /At most two/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['a']", "array['chill','lively','quiet']"), /At most two/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['chill','chill']"), /Invalid vibe/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['karaoke']"), /Invalid vibe/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['chill']", "array['spicy']"), /Invalid avoid/);
    await assert.rejects(() => prefs(host, plan, "100", "'marina'", "array['loud']"), /Invalid vibe/, "an avoid word is not a vibe");
    assert.equal(await psql(`select count(*) from plan_preferences where plan_id='${plan}'`), "0");
    // positive control: the boundary values are accepted, "Any" (all null) too.
    assert.equal(lastJson(await prefs(host, plan, "10000", "'anywhere'", "array['upscale','waterfront']", "array['loud','shisha']")).result, "saved");
    assert.equal(lastJson(await prefs(host, plan, "null", "null", "null", "null")).result, "saved");
    assert.equal(await psql(`select budget_cap is null and origin_value is null and vibes='{}' from plan_preferences where plan_id='${plan}'`), "t");
  });

  test("the server's origin list matches DUBAI_ORIGINS in lib/dubai-areas.ts", async () => {
    const src = readFileSync(new URL("../lib/dubai-areas.ts", import.meta.url), "utf8");
    const block = src.slice(src.indexOf("export const DUBAI_ORIGINS"), src.indexOf("] as const"));
    const fromTs = [...block.matchAll(/value: "([^"]+)", coordinates: (null|\{ latitude: ([\d.]+), longitude: ([\d.]+) \})/g)]
      .map((m) => `${m[1]}|${m[3] ?? ""}|${m[4] ?? ""}`).sort();
    assert.ok(fromTs.length >= 12, "parsed the TS list");
    const fromSql = (await psql(`select value||'|'||coalesce(latitude::text,'')||'|'||coalesce(longitude::text,'') from gathering_origins()`)).split("\n").sort();
    assert.deepEqual(fromSql, fromTs);
  });

  test("a member who leaves takes their answers with them; the table is in the Realtime publication", async () => {
    const host = await user();
    const friend = await user();
    const plan = await gathering(host);
    await join(plan, friend);
    await prefs(friend, plan);
    await psql(`delete from plan_access where plan_id='${plan}' and user_id='${friend}'`);
    assert.equal(await psql(`select count(*) from plan_preferences where plan_id='${plan}'`), "0");
    assert.equal(
      await psql(`select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='plan_preferences'`),
      "1",
    );
  });
});

describe("100 start_group_plan", { skip: SKIP }, () => {
  const group = `'{"budgetCap":150,"centroid":{"latitude":25.1,"longitude":55.2},"radiusKm":12,"relaxed":["distance"]}'::jsonb`;

  test("host only; deals exactly nine, sets stage, budget, origin and a server-counted summary; prefs close after", async () => {
    const host = await user("Hosty");
    const friend = await user();
    const plan = await gathering(host);
    await join(plan, friend);
    await prefs(friend, plan);
    const nine = await places(9);

    await assert.rejects(() => as(friend, `select start_group_plan('${plan}', ${arr(nine)}, ${group})`), /Only the host can deal/);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine.slice(0, 8))}, ${group})`), /Nine unique places/);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr([...nine.slice(0, 8), nine[0]])}, ${group})`), /Nine unique places/);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine)}, '{"budgetCap":99999}'::jsonb)`), /Invalid budget/);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine)}, '{"answered":99}'::jsonb)`), /Unsupported group fields/);
    assert.equal(await psql(`select stage||'/'||(select count(*) from plan_spots where plan_id=p.id) from plans p where id='${plan}'`), "gathering/0", "refusals changed nothing");

    assert.equal(lastJson(await as(host, `select start_group_plan('${plan}', ${arr(nine)}, ${group})`)).result, "dealt");
    assert.equal(
      await psql(`select stage||'/'||budget_per_person||'/'||radius_km||'/'||origin_latitude||'/'||(group_summary->>'answered')||'/'||(group_summary->'relaxed'->>0)||'/'||(select count(*)||'-'||count(distinct pool_number) from plan_spots where plan_id=p.id) from plans p where id='${plan}'`),
      "pool/150/12/25.1/1/distance/9-3",
    );

    // Stage guard: a second deal is a clean refusal, no double plan_spots.
    assert.equal(lastJson(await as(host, `select start_group_plan('${plan}', ${arr(nine)}, ${group})`)).result, "not_gathering");
    assert.equal(await psql(`select count(*) from plan_spots where plan_id='${plan}'`), "9");
    // And preferences are closed.
    assert.equal(lastJson(await prefs(friend, plan, "50")).result, "not_gathering");
    assert.equal(await psql(`select budget_cap from plan_preferences where plan_id='${plan}' and user_id='${friend}'`), "150");
  });

  test("an open plan from the old flow cannot be re-dealt; a closed place or a stranger's custom place is refused", async () => {
    const host = await user();
    const plan = await gathering(host);
    const nine = await places(9);
    await psql(`update spots set visibility='private' where id='${nine[0]}'`);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine)}, '{}'::jsonb)`), /closed right now/);
    await psql(`update spots set visibility='community' where id='${nine[0]}'`);
    await psql(`update spots set source='custom' where id='${nine[1]}'`);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine)}, '{}'::jsonb)`), /unavailable/);
    await psql(`update spots set source='curated' where id='${nine[1]}'`);

    const legacy = await psql(`insert into plans (title, stage, created_by_user_id, deadline) values ('QA098 old','pool','${host}', now()+interval '1 day') returning id`);
    await psql(`insert into plan_access values ('${legacy}','${host}')`);
    assert.equal(lastJson(await as(host, `select start_group_plan('${legacy}', ${arr(nine)}, '{}'::jsonb)`)).result, "not_gathering");
    assert.equal(await psql(`select count(*) from plan_spots where plan_id='${legacy}'`), "0");
  });

  test("an anonymous session cannot deal even on its own id; anon role cannot call any of the three", async () => {
    const host = await user();
    const plan = await gathering(host);
    const nine = await places(9);
    await assert.rejects(() => as(host, `select start_group_plan('${plan}', ${arr(nine)}, '{}'::jsonb)`, true), /permanent account is required/);
    for (const sql of [
      `select create_gathering_plan('{"title":"x","category":"dinner"}'::jsonb)`,
      `select set_plan_preferences('${plan}', 1, null, null, null)`,
      `select start_group_plan('${plan}', ${arr(nine)}, '{}'::jsonb)`,
    ]) await assert.rejects(() => psql(`set role anon; ${sql}`), /permission denied/);
  });
});
