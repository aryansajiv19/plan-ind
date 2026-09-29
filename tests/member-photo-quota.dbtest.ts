// Migrations 083/094 -- a signed-in member's Google photo quota: 120 a minute
// and 400 a day (094; was 40 and 150); the global 1,500 a day (092) still binds. Each test runs
// in one transaction that is rolled back (the secret row and the counters are
// global). Fails against a pre-083 database (no skip gate). NEVER point
// TEST_DATABASE_URL at the live project.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function psql(...commands: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("psql",
      [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", ...commands.flatMap((c) => ["-c", c])],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 20000 });
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

const SECRET = "083-test-secret-0123456789abcdef";
const hash = createHash("sha256").update(SECRET).digest("hex");
const DAY = "date_trunc('day', now())";
const as = (member: string) => `set local request.jwt.claims to '{"sub":"${member}","role":"authenticated","is_anonymous":false}';`;

/** Runs each command after installing the secret; returns every output line, comma-joined; rolls it all back. */
async function rolledBack(...sql: string[]): Promise<string> {
  const out = await psql(`begin;
      delete from app_control_secrets where name = 'server-control';
      insert into app_control_secrets(name, secret_hash) values ('server-control', '${hash}');`,
    ...sql, "rollback;");
  return out.split("\n").filter(Boolean).join(",");
}
/** How many of `n` member calls were allowed. */
const allowed = (n: number) => `do $$ declare ok int := 0; begin
    for i in 1..${n} loop if consume_app_quota('${SECRET}', 'place-photo') then ok := ok + 1; end if; end loop;
    perform set_config('qa.ok', ok::text, true); end $$;`;

describe("083 member photo quota", { skip: SKIP }, () => {
  test("a member gets 120 photos in a minute, not 121", async () => {
    const member = randomUUID();
    assert.equal(await rolledBack(as(member), allowed(121), "select current_setting('qa.ok')"), "120");
  });

  test("and 400 a day: the 400th is allowed, the 401st refused", async () => {
    const member = randomUUID();
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-day', '${member}', ${DAY}, 399);`,
      as(member), `select consume_app_quota('${SECRET}', 'place-photo')::text`, `select consume_app_quota('${SECRET}', 'place-photo')::text`,
    ), "true,false");
  });

  test("the global 1,500 a day still binds a member with quota to spare", async () => {
    const member = randomUUID();
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-global', 'global', ${DAY}, 1500);`,
      as(member), `select consume_app_quota('${SECRET}', 'place-photo')::text`,
    ), "false");
  });
});
