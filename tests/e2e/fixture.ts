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
// each and global-teardown deletes them all.
export const FIXTURE_FILE = join(process.cwd(), "tests/e2e/.fixture.local.json");

export type FixtureName = "guest-vote" | "realtime" | "vote-mobile";
export const FIXTURE_NAMES: FixtureName[] = ["guest-vote", "realtime", "vote-mobile"];

/**
 * The plan id provisioned for this spec, or "" when none exists.
 *
 * Empty is the normal, expected state when the run targets anything but a
 * local stack: global-setup withholds fixtures there so specs that cast a
 * real vote cannot reach a hosted project. Callers `test.skip()` on it.
 */
export function planIdFor(name: FixtureName): string {
  try {
    const parsed = JSON.parse(readFileSync(FIXTURE_FILE, "utf8")) as { plans?: Record<string, string> };
    return parsed.plans?.[name] ?? "";
  } catch {
    return "";
  }
}

/** Why a spec skipped, phrased so nobody has to go and find out. */
export const NO_FIXTURE_REASON =
  "skipped: no local fixture. This spec CASTS A REAL VOTE, and neither plans "
  + "nor votes can be deleted by anything in this project, so global-setup "
  + "provisions a plan only against a local stack. Point "
  + "NEXT_PUBLIC_SUPABASE_URL at 127.0.0.1 to run it.";
