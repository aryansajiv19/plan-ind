import { createClient } from "@supabase/supabase-js";
import { readFile, rm } from "node:fs/promises";

// Removes the disposable plan global-setup.ts created, so repeated local runs
// do not pile up fixtures. Only possible at all because this targets the
// LOCAL stack: the service role bypasses RLS there, and neither `plans` nor
// `votes` has a delete policy any client could use.
//
// Best-effort by design. A failed teardown must not fail a green test run --
// the rows are local, disposable, and `supabase db reset` clears them
// wholesale -- so this logs and moves on rather than throwing.

import { join } from "node:path";

// cwd-relative for the same CJS reason as global-setup.ts.
const FIXTURE_FILE = join(process.cwd(), "tests/e2e/.fixture.local.json");
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default async function globalTeardown(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return;

  let planId: string | undefined;
  try {
    planId = JSON.parse(await readFile(FIXTURE_FILE, "utf8")).planId;
  } catch {
    return; // no fixture recorded; nothing to clean
  }
  if (!planId) return;

  const admin = createClient(url, LOCAL_SERVICE_KEY, { auth: { persistSession: false } });
  // votes/plan_spots/plan_access cascade from plans.
  const { error } = await admin.from("plans").delete().eq("id", planId);
  if (error) console.warn(`[e2e] teardown could not remove plan ${planId}: ${error.message}`);
  else console.log(`[e2e] disposable plan ${planId} removed`);
  await rm(FIXTURE_FILE, { force: true });
}
