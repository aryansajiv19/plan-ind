import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guest vote cast, end to end: fresh browser state -> anon session ->
// claim_plan_access -> NameGate -> cast a vote -> the card flips to
// aria-pressed="true" and the voter count goes up. This is the product's
// delivery item #1, and mostly a mobile path, which is why the matrix in
// playwright.config.ts runs it on WebKit and two phone profiles.
//
// ── Why this no longer touches the live project ──────────────────────────
//
// It used to vote on a hardcoded plan in the LIVE project on every run,
// which is why RUN_E2E was left off and this never ran in CI at all.
//
// It could not simply be taught to clean up after itself: `plans` and
// `votes` have NO delete policy (both are read-only to clients by design;
// writes go through security-definer RPCs), and this project has no
// service-role key, so nothing can remove a plan or a vote from a hosted
// project once created. Per-run fixtures against live would leave rows
// behind permanently -- worse than the shared fixture they replaced.
//
// So the fixture is a disposable plan created on the LOCAL stack by
// global-setup.ts and deleted by global-teardown.ts. Setup refuses any
// non-loopback URL, so a misconfigured CI cannot point the browser matrix at
// production and start casting votes.
//
// Because the plan is private to this run, the voter count assertion is now
// EXACT (0 -> 1) instead of "went up by at least one" — the old wording was
// hedging against concurrent runs on shared data, and that ambiguity is gone.
const PLAN_ID: string = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "tests/e2e/.fixture.local.json"), "utf8")).planId ?? "";
  } catch {
    return "";
  }
})();

test("a guest can open a shared plan and cast a vote", async ({ page }) => {
  test.skip(
    !PLAN_ID,
    "no local fixture — global-setup.ts provisions one against a local Supabase stack; see tests/README.md",
  );

  await page.goto(`/plan/${PLAN_ID}`);

  // A fresh Playwright context has no saved voter name, so the NameGate is
  // expected — but don't hard-fail if storage state carried one over.
  // `.isVisible()` checks the DOM once and returns immediately (it does not
  // poll), which raced the bootstrap (anon sign-in + claim_plan_access + the
  // plan/spots fetch) and always came back false. `.waitFor()` actually polls.
  const nameInput = page.getByPlaceholder("Your name");
  const nameGateShown = await nameInput
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (nameGateShown) {
    await nameInput.fill(`Playwright ${Date.now()}`);
    await page.getByRole("button", { name: "Start voting" }).click();
  }

  const votersLabel = page.getByText(/\d+ (?:person|people) voting/);
  await expect(votersLabel).toBeVisible({ timeout: 15_000 });
  const votersBefore = await readVoterCount(votersLabel);

  // Each vote card is a single <button aria-pressed> (see OptionCard.tsx) —
  // its accessible name is the whole card's text, so aria-pressed is the
  // reliable way to tell "not yet voted" from "voted" apart, not the
  // "Select"/"Selected" label text (the latter is a substring of the former).
  // Located structurally (first card in the grid), not by [aria-pressed=…]:
  // that attribute is what the click changes, so a locator built on its
  // current value re-resolves to a *different* card once it flips.
  const firstCard = page.locator(".vote-options-grid button.token").first();
  await expect(firstCard).toHaveAttribute("aria-pressed", "false"); // fresh anon guest, nothing voted yet
  await firstCard.click();
  await expect(firstCard).toHaveAttribute("aria-pressed", "true");

  // Exact, not "greater than": this plan belongs to this run alone, so a
  // second voter appearing would be a real bug rather than a parallel run.
  await expect
    .poll(async () => readVoterCount(votersLabel), { timeout: 5_000 })
    .toBe(votersBefore + 1);
});

async function readVoterCount(locator: import("@playwright/test").Locator): Promise<number> {
  const text = await locator.textContent();
  return Number(text?.match(/(\d+)\s+(?:person|people)/)?.[1] ?? NaN);
}
