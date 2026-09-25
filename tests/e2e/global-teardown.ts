import { rm } from "node:fs/promises";

// Removes the disposable plans global-setup.ts created and every test account
// this run minted, so repeated local runs do not pile up fixtures. Only
// possible at all because this targets the LOCAL stack: the service role
// bypasses RLS there, and neither `plans` nor `votes` has a delete policy any
// client could use.
//
// Best-effort by design. A failed teardown must not fail a green test run --
// the rows are local, disposable, and `supabase db reset` clears them
// wholesale -- so this logs and moves on rather than throwing.

import { FIXTURE_FILE, readFixture } from "./fixture";
import { deleteRunMembers, isLocalStack, localAdmin } from "./local-stack";

export default async function globalTeardown(): Promise<void> {
  if (!isLocalStack(process.env.NEXT_PUBLIC_SUPABASE_URL)) return;

  const { runId, plans } = readFixture();
  const planIds = Object.values(plans ?? {});

  if (planIds.length > 0) {
    // votes/plan_spots/plan_access cascade from plans.
    const { error } = await localAdmin().from("plans").delete().in("id", planIds);
    if (error) console.warn(`[e2e] teardown could not remove ${planIds.length} plans: ${error.message}`);
    else console.log(`[e2e] ${planIds.length} disposable plans removed`);
  }
  if (runId) {
    // people and member_ages cascade from auth.users.
    try {
      console.log(`[e2e] ${await deleteRunMembers(runId)} test accounts removed`);
    } catch (error) {
      console.warn(`[e2e] teardown could not remove test accounts: ${(error as Error).message}`);
    }
  }
  await rm(FIXTURE_FILE, { force: true });
}
