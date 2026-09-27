// Migration 070 — catalogue truth (generated from data/venue-facts.json by
// scripts/gen-catalogue-truth.mjs). The migration's data half only touches
// the 82 curated ids, which a scratch database doesn't have, so the apply
// test inserts the rows it checks and runs the real file inside a
// transaction that is rolled back. Fails against a pre-070 database (no
// skip gate). NEVER point TEST_DATABASE_URL at the live project.
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const MIGRATION = fileURLToPath(new URL("../supabase/migration-070-catalogue-truth.sql", import.meta.url));

async function psql(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-q", "-A", "-t", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", ...args],
      { env: { ...process.env, PGCONNECT_TIMEOUT: "3" }, timeout: 30000 });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(String(e.stderr ?? e.message ?? err).trim());
  }
}
const sql = (s: string) => psql("-c", s);

const SKIP = await sql("select auth.uid()").then(
  () => false as const,
  () => `no Supabase-shaped Postgres at ${DB_URL} — set TEST_DATABASE_URL to a LOCAL database (never the live project)`,
);

const FACT_COLUMNS = ["reopens_on", "phone", "website", "licensed", "dress_code", "parking", "reservations",
  "halal_friendly", "vegetarian_options", "spend_pp_aed", "good_to_know", "nearest_station", "station_line",
  "station_walk_min", "facts_checked_on", "facts_sources"];

const IDS = {
  cove: "40000000-0000-0000-0000-000000000003",
  museum: "87000000-0000-0000-0000-000000000003",
  sky: "81000000-0000-0000-0000-000000000003",
  soho: "81000000-0000-0000-0000-000000000001",
  iris: "d0000000-0000-0000-0000-000000000004",
};

describe("070 catalogue truth", { skip: SKIP }, () => {
  test("the new columns are readable by anon and signed-in visitors", async () => {
    const out = await sql(`select string_agg(r || ':' || c, ',') from unnest(array['anon','authenticated']) r,
      unnest(array[${FACT_COLUMNS.map((c) => `'${c}'`).join(",")}]) c
      where not has_column_privilege(r, 'public.spots', c, 'SELECT')`);
    assert.equal(out, "", `not readable: ${out}`);
  });

  test("only curated rows carry facts, and a website must be http(s)", async () => {
    const id = randomUUID();
    const uid = randomUUID();
    await assert.rejects(sql(`begin;
      insert into auth.users (id, aud, role, email, created_at, updated_at) values ('${uid}','authenticated','authenticated','${uid}@qa.invalid', now(), now());
      insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,source,visibility,created_by_user_id,website)
        values ('${id}','QA070 custom','dinner','Dubai','Custom place','$$',0,'Flexible','note','custom','private','${uid}','https://example.test');
      rollback;`), /spots_custom_no_facts/);
    await assert.rejects(sql(`begin;
      insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe,website)
        values ('${id}','QA070 curated','dinner','Dubai','Test','$$',100,'12am','test','javascript:alert(1)');
      rollback;`), /spots_website_http/);
  });

  test("applying 070: closures, corrections and checked facts land; flagged values don't", async () => {
    const rows = Object.values(IDS).map((id, i) =>
      `('${id}','QA070 ${i}','dinner','Old area','Test','$$',100,'12am','test')`).join(",");
    const check = `select
      (select visibility from spots where id='${IDS.sky}') || '|' ||
      coalesce((select latitude::text from spots where id='${IDS.sky}'), 'no-coords') || '|' ||
      (select reopens_on::text from spots where id='${IDS.museum}') || '|' ||
      (select area from spots where id='${IDS.cove}') || '|' ||
      (select name || ' @ ' || area from spots where id='${IDS.iris}') || '|' ||
      (select phone || ' ' || website || ' ' || facts_checked_on::text from spots where id='${IDS.soho}') || '|' ||
      (select (jsonb_array_length(facts_sources) > 0)::text from spots where id='${IDS.soho}') || '|' ||
      coalesce((select good_to_know from spots where id='${IDS.museum}'), 'no-note')`;
    const out = await psql(
      "-c", `begin; insert into spots (id,name,category,area,cuisine,price_band,min_spend,open_till,vibe) values ${rows};`,
      "-f", MIGRATION, "-c", check, "-c", "rollback;");
    assert.equal(out.split("\n").filter(Boolean).pop(), [
      "private",                       // SKY2.0: retired
      "no-coords",                     // its coordinates were flagged stale by the checker
      "2027-04-01",                    // Museum of the Future reopens
      "La Vie, JBR",                   // Cove Beach moved
      "Iris Harbour @ Dubai Harbour",  // Iris's current venue
      "+971 56 793 3366 https://sohogardendxb.com/ 2026-09-27",
      "true",
      "no-note",                       // a research note is never shown to guests
    ].join("|"));
  });
});
