// Migration 081 -- folders group an account's lists, same owner enforced by
// the database. Each test fails against a pre-081 database (no skip gate).
// Everything it creates is swept in `after`. NEVER point TEST_DATABASE_URL at
// the live project.
import test, { after, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";

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

const made: string[] = [];
/** An account and its profile; returns the uid (also the people.id here). */
async function user(): Promise<string> {
  const uid = randomUUID();
  await psql(`insert into auth.users (id, aud, role, email, created_at, updated_at)
      values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
    insert into people (id, display_name, auth_user_id) values ('${uid}', 'QA-${randomBytes(3).toString("hex")}', '${uid}');`);
  made.push(uid);
  return uid;
}
const as = (uid: string, sql: string) =>
  psql(`set request.jwt.claims to '{"sub":"${uid}","role":"authenticated","is_anonymous":false}'; set role authenticated; ${sql}`);
const folder = (uid: string, name = `Weekend ${randomBytes(2).toString("hex")}`) =>
  as(uid, `insert into folders (person_id, name) values ('${uid}', '${name}') returning id`);
/** One list of each kind, owned by uid. */
async function lists(uid: string) {
  return {
    board: await as(uid, `insert into moodboards (person_id, name) values ('${uid}', 'Board') returning id`),
    been: await as(uid, `insert into visit_collections (person_id, name) values ('${uid}', 'Been') returning id`),
    saved: await as(uid, `insert into place_collections (person_id, name) values ('${uid}', 'Saved ${randomBytes(2).toString("hex")}') returning id`),
  };
}

after(async () => {
  if (SKIP || made.length === 0) return;
  await psql(`delete from auth.users where id in (${made.map((id) => `'${id}'`).join(",")})`);
});

describe("081 folders", { skip: SKIP }, () => {
  test("an owner files each kind of list in their own folder, and deleting the folder un-files them", async () => {
    const a = await user();
    const f = await folder(a);
    const l = await lists(a);
    await as(a, `update moodboards set folder_id = '${f}' where id = '${l.board}';
      update visit_collections set folder_id = '${f}' where id = '${l.been}';
      update place_collections set folder_id = '${f}' where id = '${l.saved}';`);
    assert.equal(await psql(`select (select count(*) from moodboards where folder_id = '${f}')
      + (select count(*) from visit_collections where folder_id = '${f}') + (select count(*) from place_collections where folder_id = '${f}')`), "3");
    await as(a, `delete from folders where id = '${f}'`);
    assert.equal(await psql(`select count(*) from moodboards where id = '${l.board}' and folder_id is null and person_id = '${a}'`), "1", "the list stays, its owner intact");
    assert.equal(await psql(`select count(*) from visit_collections where id = '${l.been}' and folder_id is null`), "1");
    assert.equal(await psql(`select count(*) from place_collections where id = '${l.saved}' and folder_id is null`), "1");
  });

  test("a list can't be filed in someone else's folder", async () => {
    const [a, b] = [await user(), await user()];
    const theirs = await folder(b);
    const l = await lists(a);
    for (const [table, id] of [["moodboards", l.board], ["visit_collections", l.been], ["place_collections", l.saved]]) {
      await assert.rejects(as(a, `update ${table} set folder_id = '${theirs}' where id = '${id}'`), /violates foreign key constraint/);
    }
  });

  test("folders are private: others can't read, rename, delete or create one for you; anon has nothing", async () => {
    const [a, b] = [await user(), await user()];
    const f = await folder(a);
    assert.equal(await as(b, `select count(*) from folders where id = '${f}'`), "0");
    assert.equal(await as(b, `with x as (update folders set name = 'Mine now' where id = '${f}' returning 1) select count(*) from x`), "0");
    assert.equal(await as(b, `with x as (delete from folders where id = '${f}' returning 1) select count(*) from x`), "0");
    await assert.rejects(as(b, `insert into folders (person_id, name) values ('${a}', 'Planted')`), /row-level security/);
    assert.equal(await psql(`select has_table_privilege('anon', 'folders', 'select')`), "f");
    assert.equal(await psql(`select count(*) from pg_publication_tables where tablename = 'folders'`), "0");
  });

  test("names are clean and unique per owner (case-blind); deleting the account takes its folders", async () => {
    const a = await user();
    await folder(a, "Date nights");
    await assert.rejects(folder(a, "date NIGHTS"), /folders_name_ci_idx/);
    await assert.rejects(folder(a, " padded "), /check constraint/);
    await assert.rejects(as(a, `insert into folders (person_id, name, emoji) values ('${a}', 'Bidi', 'x' || chr(8238))`), /check constraint/);
    await psql(`delete from people where id = '${a}'`);
    assert.equal(await psql(`select count(*) from folders where person_id = '${a}'`), "0");
  });
});
