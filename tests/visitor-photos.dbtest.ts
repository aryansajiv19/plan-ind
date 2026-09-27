// Migration 077 -- Google venue photos for signed-out visitors: a per-hashed-IP
// scope in consume_otp_limit that also counts against 063's global daily photo
// counter. Each test runs in one transaction that is rolled back (the secret
// row and the counters are global). Fails against a pre-077 database (no skip
// gate). NEVER point TEST_DATABASE_URL at the live project.
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

const SECRET = "077-test-secret-0123456789abcdef";
const hash = createHash("sha256").update(SECRET).digest("hex");
const visitor = (subject: string, secret = SECRET) => `consume_otp_limit('${secret}', 'place-photo-anon', '${subject}')`;
const DAY = "date_trunc('day', now())";

/** Runs each command after installing the secret; returns every output line, comma-joined; rolls it all back. */
async function rolledBack(...sql: string[]): Promise<string> {
  const out = await psql(`begin;
      delete from app_control_secrets where name = 'server-control';
      insert into app_control_secrets(name, secret_hash) values ('server-control', '${hash}');`,
    ...sql, "rollback;");
  return out.split("\n").filter(Boolean).join(",");
}
/** How many of `n` calls for one subject were allowed. */
const allowedOf = (subject: string, n: number) => `do $$ declare ok int := 0; begin
    for i in 1..${n} loop if ${visitor(subject)} then ok := ok + 1; end if; end loop;
    perform set_config('qa.ok', ok::text, true); end $$;`;

describe("077 venue photos for signed-out visitors", { skip: SKIP }, () => {
  test("a visitor's IP gets 40 photos a minute, and another IP its own", async () => {
    const ip = `ip:${randomUUID()}`;
    assert.equal(await rolledBack(allowedOf(ip, 45), "select current_setting('qa.ok')", `select ${visitor(`ip:${randomUUID()}`)}::text`), "40,true");
  });

  test("and 120 a day: the 120th is allowed, the 121st refused", async () => {
    const ip = `ip:${randomUUID()}`;
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-anon-day', '${ip}', ${DAY}, 119);`,
      `select ${visitor(ip)}::text`, `select ${visitor(ip)}::text`), "true,false");
  });

  test("visitors stop at 200 of the global 300 a day; members keep the last 100", async () => {
    const member = randomUUID();
    const asMember = `set local request.jwt.claims to '{"sub":"${member}","role":"authenticated","is_anonymous":false}';`;
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-global', 'global', ${DAY}, 199);`,
      `select ${visitor(`ip:${randomUUID()}`)}::text`, `select ${visitor(`ip:${randomUUID()}`)}::text`, // the 200th, then the 201st
    ), "true,false");
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-global', 'global', ${DAY}, 250);`, asMember,
      `select consume_app_quota('${SECRET}', 'place-photo')::text`, `select ${visitor(`ip:${randomUUID()}`)}::text`,
    ), "true,false"); // a member at 251 still gets one; a visitor there doesn't
    assert.equal(await rolledBack(
      `insert into app_rate_limits values ('place-photo-global', 'global', ${DAY}, 300);`, asMember,
      `select consume_app_quota('${SECRET}', 'place-photo')::text`), "false"); // 300 still binds everyone
  });

  test("the sample deal never spends the photo budget; a wrong secret is refused; the anon role may call it", async () => {
    assert.equal(await rolledBack(
      `select consume_otp_limit('${SECRET}', 'deal-preview', 'ip:${randomUUID()}')::text`,
      "select count(*) from app_rate_limits where scope = 'place-photo-global'"), "true,0");
    await assert.rejects(rolledBack(`select ${visitor("ip:x", "wrong-secret-0123456789abcdef")}`), /Server authorization required/);
    assert.equal(await rolledBack("set local role anon;", `select ${visitor(`ip:${randomUUID()}`)}::text`), "true");
  });
});
