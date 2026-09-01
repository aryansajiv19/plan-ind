import { test, expect } from "@playwright/test";

// Guest vote cast, end to end, against the live Supabase project (via
// .env.local — same credentials scripts/smoke-test.mjs uses). Requires B1
// (anonymous sign-ins) to be live and the seeded plan
// 22222222-2222-2222-2222-222222222222 to exist with its three round-1 spots.
//
// Manually verified against this exact plan in a Chromium session on
// 2026-09-01 (see worklog.md, "Guest vote path verified end to end"); this
// spec automates that same walk: fresh browser state -> anon session ->
// claim_plan_access -> NameGate -> cast a vote -> the card flips to
// aria-pressed="true" and the voter count goes up.
//
// This plan is shared test fixture data — other sessions/CI runs may vote on
// it concurrently, so the assertion is "went up by at least one", not an
// exact before/after count.
const PLAN_ID = "22222222-2222-2222-2222-222222222222";

test("a guest can open a shared plan and cast a vote", async ({ page }) => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "needs NEXT_PUBLIC_SUPABASE_URL/.env.local — see tests/README.md",
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

  await expect
    .poll(async () => readVoterCount(votersLabel), { timeout: 5_000 })
    .toBeGreaterThan(votersBefore);
});

async function readVoterCount(locator: import("@playwright/test").Locator): Promise<number> {
  const text = await locator.textContent();
  return Number(text?.match(/(\d+)\s+(?:person|people)/)?.[1] ?? NaN);
}
