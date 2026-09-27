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

  // Security review: a CR or a bidi override (U+202E) survived a direct insert.
  test("control characters and bidi overrides are cleaned out; a name of nothing else is refused", async () => {
    const uid = await member();
    await insertSpot(uid, { name: "E'QA068\\r\\u202E place'", vibe: "E'a\\nnote'", description: "E'\\u202E'" });
    const id = made.spots.at(-1)!;
    assert.equal(await psql(`select name || '|' || vibe || '|' || coalesce(description, 'null') from spots where id = '${id}'`),
      "QA068 place|anote|null");
    await psql(`update spots set area = E'Dubai\\u202E' where id = '${id}'`); // an edit is cleaned too
    assert.equal(await psql(`select area from spots where id = '${id}'`), "Dubai");
    await assert.rejects(insertSpot(uid, { name: "E'\\r\\n'" }), /A place name is required/);
  });

  test("applying 068 cleans custom rows written before it, and a name that cleans to nothing doesn't stop it", async () => {
    const uid = await member();
    const [id, blank] = [randomUUID(), randomUUID()];
    const migration = new URL("../supabase/migration-068-data-hygiene.sql", import.meta.url).pathname;
    // No DDL: replica mode skips triggers for this one insert, as a pre-068 row had none.
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1",
      "-c", `begin; set session_replication_role = replica;
        insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,source,visibility,created_by_user_id)
          values ('${id}',E'QA068\\u202E old','dinner','Dubai','Custom place','$$',0,'Flexible','note','custom','community','${uid}'),
                 ('${blank}',E'\\u202E\\r','dinner','Dubai','Custom place','$$',0,'Flexible','note','custom','community','${uid}');
        set session_replication_role = origin;`,
      "-f", migration,
      "-c", `select string_agg(name, '|' order by id = '${blank}') from spots where id in ('${id}', '${blank}')`,
      "-c", "rollback"], { timeout: 60000 });
    assert.equal(stdout.trim().split("\n").filter(Boolean).pop(), "QA068 old|Unnamed place");
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

// ── C1 + F1 ─────────────────────────────────────────────────────────────────
// The cap is a trigger on the row write that lands; Storage writes that row as
// a superuser after an RLS probe it rolls back, so the superuser cases below
// are the ones that matter.
describe("068 visit-photo upload cap (C1, F1)", { skip: SKIP }, () => {
  const LIMIT = /Photo storage limit reached/;
  const seed = (uid: string, n: number, bytes = 0) =>
    psql(`insert into storage.objects (bucket_id, name, owner_id, metadata)
      select 'visit-photos', '${uid}/seed/' || g || '-' || gen_random_uuid() || '.jpg', '${uid}', jsonb_build_object('size', ${bytes})
      from generate_series(1, ${n}) g`);
  const fileAs = (uid: string, name: string, bytes: number, asUser: boolean) => {
    const sql = `insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('visit-photos', '${uid}/x/${name}.jpg', '${uid}', jsonb_build_object('size', ${bytes}))`;
    return asUser ? as(uid, sql) : psql(sql);
  };

  test("an account's 200th file is accepted and its 201st refused", async () => {
    const uid = await member();
    await seed(uid, 199);
    await fileAs(uid, "200", 1, true);
    await assert.rejects(fileAs(uid, "201", 1, true), LIMIT);
  });

  test("the superuser write that lands is held to the cap too", async () => {
    const uid = await member();
    await seed(uid, 200);
    await assert.rejects(fileAs(uid, "201", 1, false), LIMIT);
  });

  test("500 MB refuses the next file, however few files that is (F1)", async () => {
    const uid = await member();
    await seed(uid, 1, 499 * 1024 * 1024);
    await fileAs(uid, "small", 1024, false); // positive control, still under 500 MB
    await assert.rejects(fileAs(uid, "big", 2 * 1024 * 1024, false), LIMIT);
  });

  test("a parallel pair at 199 files ends at exactly 200: one lands, one is refused", async () => {
    const uid = await member();
    await seed(uid, 199);
    const insert = (n: string) => `insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('visit-photos', '${uid}/burst/${n}.jpg', '${uid}', '{"size": 1}');`;
    // A holds its transaction (and the per-owner lock) open for a second; B,
    // fired just after, must wait for it and then see A's file.
    const results = await Promise.allSettled([
      psql(`begin; ${insert("a")} select pg_sleep(1); commit;`),
      new Promise((r) => setTimeout(r, 200)).then(() => psql(insert("b"))),
    ]);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal(await psql(`select count(*) from storage.objects where bucket_id='visit-photos' and owner_id='${uid}'`), "200");
  });
});

describe("068 visit photos stay in their owner's folder", { skip: SKIP }, () => {
  test("a move into another user's folder is refused; an own-folder rename is fine", async () => {
    const [a, b] = [await member(), await member()];
    const id = await psql(`insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('visit-photos', '${a}/v/1.jpg', '${a}', '{"size": 1}') returning id`);
    await as(a, `update storage.objects set name = '${a}/v/renamed.jpg' where id = '${id}'`);
    await assert.rejects(
      as(a, `update storage.objects set name = '${b}/v/1.jpg' where id = '${id}'`),
      /Visit photos belong in your own folder/,
    );
    assert.equal(await psql(`select name from storage.objects where id = '${id}'`), `${a}/v/renamed.jpg`);
  });

  test("a file with no owner is refused, even on the superuser write", async () => {
    const a = await member();
    await assert.rejects(
      psql(`insert into storage.objects (bucket_id, name, owner_id) values ('visit-photos', '${a}/v/x.jpg', null)`),
      /Visit photos belong in your own folder/,
    );
  });
});
