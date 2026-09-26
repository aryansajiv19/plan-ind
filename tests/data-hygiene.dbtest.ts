// Migration 068 — data hygiene. One describe per rule; each fails against a
// pre-068 database (no "068 applied?" skip gate, on purpose). Everything it
// creates is swept in `after`. NEVER point TEST_DATABASE_URL at the live project.
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
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL stack (never the live project)`,
);

const made = { users: [] as string[], spots: [] as string[] };

/** A permanent account with a people row whose id is its uid (the app's shape). */
async function member(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA068', '${uid}');`);
  made.users.push(uid);
  return uid;
}
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);

after(async () => {
  if (SKIP) return;
  const ids = (xs: string[]) => xs.map((x) => `'${x}'`).join(",");
  if (made.users.length) {
    // Storage's own trigger refuses direct deletes unless this session opts in.
    await psql(`set storage.allow_delete_query = 'true';
      delete from storage.objects where bucket_id = 'visit-photos' and owner_id in (${ids(made.users)})`);
    await psql(`delete from visits where person_id in (${ids(made.users)})`);
  }
  if (made.spots.length) await psql(`delete from spots where id in (${ids(made.spots)})`);
  if (made.users.length) {
    await psql(`delete from people where id in (${ids(made.users)})`);
    await psql(`delete from auth.users where id in (${ids(made.users)})`);
  }
});

// ── R4 ──────────────────────────────────────────────────────────────────────
describe("068 custom spots carry no links or photos, and bounded text (R4)", { skip: SKIP }, () => {
  const insertSpot = (uid: string, extra: Record<string, string>) => {
    const id = randomUUID();
    made.spots.push(id);
    const cols: Record<string, string> = {
      id: `'${id}'`, name: "'QA068 place'", category: "'dinner'", area: "'Dubai'", cuisine: "'Custom place'",
      price_band: "'$$'", min_spend: "0", open_till: "'Flexible'", vibe: "'a note'", source: "'custom'",
      visibility: "'community'", created_by_user_id: `'${uid}'`, ...extra,
    };
    return as(uid, `insert into spots (${Object.keys(cols).join(",")}) values (${Object.values(cols).join(",")})`);
  };

  test("a plain custom spot is accepted (control)", async () => {
    await insertSpot(await member(), {});
  });

  test("a booking_url or photo_url on a custom spot is refused", async () => {
    const uid = await member();
    await assert.rejects(insertSpot(uid, { booking_url: "'https://evil.example/phish'" }), /spots_custom_no_links/);
    await assert.rejects(insertSpot(uid, { photo_url: "'https://evil.example/pixel.gif'" }), /spots_custom_no_links/);
  });

  test("an over-long name is refused", async () => {
    await assert.rejects(insertSpot(await member(), { name: `'${"A".repeat(81)}'` }), /spots_custom_text_caps/);
  });
});

// ── R9 ──────────────────────────────────────────────────────────────────────
describe("068 'friends' visit photos (R9)", { skip: SKIP }, () => {
  test("a friend sees a 'friends' photo; a friend of a friend does not", async () => {
    const [a, b, c] = [await member(), await member(), await member()];
    // Mirror triggers add the reverse rows: A<->B, B<->C.
    await psql(`insert into friendships (person_id, friend_id) values ('${a}','${b}'), ('${b}','${c}')`);
    const spot = randomUUID();
    made.spots.push(spot);
    await psql(`insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe)
      values ('${spot}','QA068 visited','dinner','Dubai','Test','$$',100,'12am','test')`);
    const visit = await psql(`insert into visits (person_id, spot_id) values ('${a}','${spot}') returning id`);
    await psql(`insert into visit_photos (visit_id, person_id, storage_path, visibility)
      values ('${visit}','${a}','${a}/${visit}/1.jpg','friends')`);
    const seen = (uid: string) => as(uid, `select count(*) from visit_photos where person_id = '${a}'`);
    assert.equal(await seen(b), "1");
    assert.equal(await seen(c), "0");
  });
});

// ── R18 ─────────────────────────────────────────────────────────────────────
describe("068 place_collection_items reverse-lookup indexes (R18)", { skip: SKIP }, () => {
  test("spot_id and import_id each lead an index", async () => {
    const leading = await psql(`select string_agg(distinct (regexp_match(indexdef, '\\((\\w+)'))[1], ',' order by (regexp_match(indexdef, '\\((\\w+)'))[1])
      from pg_indexes where tablename = 'place_collection_items'`);
    assert.match(leading, /\bimport_id\b/);
    assert.match(leading, /\bspot_id\b/);
  });
});

// ── C1 ──────────────────────────────────────────────────────────────────────
describe("068 visit-photo upload cap (C1, F1)", { skip: SKIP }, () => {
  test("an account's 200th file is accepted and its 201st refused", async () => {
    const uid = await member();
    await psql(`insert into storage.objects (bucket_id, name, owner_id)
      select 'visit-photos', '${uid}/seed/' || g || '.jpg', '${uid}' from generate_series(1, 199) g`);
    const upload = (n: number) =>
      as(uid, `insert into storage.objects (bucket_id, name, owner_id) values ('visit-photos', '${uid}/x/${n}.jpg', '${uid}')`);
    await upload(200);
    await assert.rejects(upload(201), /row-level security/);
  });

  test("500 MB stored refuses the next file, however few files that is (F1)", async () => {
    const uid = await member();
    await psql(`insert into storage.objects (bucket_id, name, owner_id, metadata)
      select 'visit-photos', '${uid}/big/' || g || '.jpg', '${uid}', jsonb_build_object('size', 300 * 1024 * 1024)
      from generate_series(1, 2) g`);
    await assert.rejects(
      as(uid, `insert into storage.objects (bucket_id, name, owner_id) values ('visit-photos', '${uid}/x/3.jpg', '${uid}')`),
      /row-level security/,
    );
  });
});
