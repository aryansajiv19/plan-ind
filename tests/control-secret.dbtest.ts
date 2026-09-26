// Migration 066: valid_control_secret accepts the old bcrypt row and a sha256
// hex row, and nothing else. Each case runs in one psql call inside a
// transaction that rolls back, so the stack's real 'server-control' row is
// never changed. NEVER point TEST_DATABASE_URL at the live project.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 },
  );
  return stdout.trim();
}

async function detectSkip(): Promise<string | false> {
  try {
    await psql("select 1");
  } catch {
    return `no reachable Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL Supabase (never the live project)`;
  }
  const body = await psql("select prosrc from pg_proc where proname = 'valid_control_secret'").catch(() => "");
  return body.includes("sha256") ? false : "valid_control_secret has no sha256 branch — migration 066 not applied";
}
const SKIP = await detectSkip();

const SECRET = "066-test-secret-0123456789abcdef";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** valid_control_secret for [right, wrong, null] with the row set to `hashSql`, rolled back. */
async function checks(hashSql: string): Promise<string> {
  return psql(`
    begin;
    delete from app_control_secrets where name = 'server-control';
    insert into app_control_secrets(name, secret_hash) values ('server-control', ${hashSql});
    select valid_control_secret('${SECRET}')::text || ',' || valid_control_secret('wrong')::text
      || ',' || valid_control_secret(null)::text;
    rollback;`);
}

/** valid_control_secret(argSql) with the row set to `hashSql`, rolled back. */
async function one(hashSql: string, argSql: string): Promise<string> {
  return psql(`
    begin;
    delete from app_control_secrets where name = 'server-control';
    insert into app_control_secrets(name, secret_hash) values ('server-control', ${hashSql});
    select valid_control_secret(${argSql})::text;
    rollback;`);
}

describe("valid_control_secret (migration 066)", { skip: SKIP }, () => {
  test("a bcrypt row still verifies, so applying 066 alone changes nothing", async () => {
    assert.equal(await checks(`extensions.crypt('${SECRET}', extensions.gen_salt('bf'))`), "true,false,false");
  });

  test("a sha256 hex row verifies the same secret", async () => {
    assert.equal(await checks(`'${sha256(SECRET)}'`), "true,false,false");
  });

  test("any other format fails closed: the plaintext secret stored as the row never matches", async () => {
    assert.equal(await checks(`'${SECRET}'`), "false,false,false");
  });

  test("an empty or oversize secret never verifies, even when the row is its digest", async () => {
    // An unset env var hashed by mistake stores sha256(''): '' must still fail.
    assert.equal(await one(`'${sha256("")}'`, "''"), "false");
    assert.equal(await one(`'${sha256("")}'`, "null"), "false");
    const long = "x".repeat(257);
    assert.equal(await one(`'${sha256(long)}'`, `'${long}'`), "false");
    // Positive control at the bound, so the 257 case fails on length alone.
    const max = "x".repeat(256);
    assert.equal(await one(`'${sha256(max)}'`, `'${max}'`), "true");
  });

  test("no client role can execute it, or read the table", async () => {
    const table = await psql(`
      select string_agg(r || '=' || has_table_privilege(r, 'app_control_secrets', 'select')::text, ',')
      from unnest(array['anon', 'authenticated']) r`);
    assert.equal(table, "anon=false,authenticated=false");
    const grants = await psql(`
      select string_agg(r || '=' || has_function_privilege(r, 'valid_control_secret(text)', 'execute')::text, ',')
      from unnest(array['anon', 'authenticated']) r`);
    assert.equal(grants, "anon=false,authenticated=false");
  });
});
