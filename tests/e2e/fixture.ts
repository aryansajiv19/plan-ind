import { readFileSync } from "node:fs";
import { join } from "node:path";

// One disposable plan PER SPEC, not one shared between them.
//
// They were sharing a single plan, which broke as soon as more than one
// ran: playwright.config.ts sets `fullyParallel`, so guest-vote,
// realtime-multi-client and vote-mobile were all voting on the same rows at
// the same time. Each spec's assertions are exact -- "the count goes to
// exactly one", "this card is not selected" -- and exact assertions are only
// meaningful when the spec owns its data.
//
// That is the same defect the live shared fixture had, which is why the
// original guest-vote assertion had to hedge with "went up by at least one".
// Re-introducing it locally between specs would have re-earned the hedge.
//
// Names are stable keys, not paths: global-setup provisions one plan for
// each and global-teardown deletes them all, along with every test account
// minted under this run's `runId` (see local-stack.ts).
export const FIXTURE_FILE = join(process.cwd(), "tests/e2e/.fixture.local.json");

export type FixtureName = "guest-vote" | "realtime" | "vote-mobile" | "sign-in-gate";
export const FIXTURE_NAMES: FixtureName[] = ["guest-vote", "realtime", "vote-mobile", "sign-in-gate"];

export interface FixtureFile {
  runId?: string;
  plans?: Record<string, string>;
  titles?: Record<string, string>;
}

export function readFixture(): FixtureFile {
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as FixtureFile;
  } catch {
    return {};
  }
}

/**
 * The plan id provisioned for this spec, or "" when none exists.
 *
 * Empty is the normal, expected state when the run targets anything but a
 * local stack: global-setup withholds fixtures there so specs that sign in a
 * test account or cast a real vote cannot reach a hosted project. Callers
 * `test.skip()` on it.
 */
export function planIdFor(name: FixtureName): string {
  return readFixture().plans?.[name] ?? "";
}

/** The exact title global-setup gave this spec's plan, or "". */
export function planTitleFor(name: FixtureName): string {
  return readFixture().titles?.[name] ?? "";
}

/** Why a spec skipped, phrased so nobody has to go and find out. */
export const NO_FIXTURE_REASON =
  "skipped: no local fixture. Plans need a permanent account now, and test "
  + "accounts are minted with the LOCAL stack's admin key; this spec may also "
  + "CAST A REAL VOTE, and nothing can delete a plan or vote from a hosted "
  + "project. So global-setup provisions only against a local stack. Point "
  + "NEXT_PUBLIC_SUPABASE_URL at 127.0.0.1 to run it.";
