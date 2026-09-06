import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TWO clients, one plan. This is the test that makes the rest of the E2E
// suite honest.
//
// guest-vote.spec.ts passes with Realtime deleted from the app: one browser
// casting its own vote and reading its own count never needs a subscription.
// Every genuinely multi-person property of this product — a second voter's
// count arriving, the round closing under you, the winner appearing while
// you watch — was therefore untested, in an app whose entire purpose is
// group decision-making.
//
// It was also broken. Realtime drops postgres_changes for a non-service
// subscriber on an RLS table with the default replica identity, because it
// cannot evaluate the row against RLS, and it drops them SILENTLY —
// subscribe() still reports SUBSCRIBED. Migration 045 sets REPLICA IDENTITY
// FULL on every published table; without 045 applied, this spec fails and
// guest-vote still passes, which is exactly the gap it exists to close.
const PLAN_ID: string = (() => {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "tests/e2e/.fixture.local.json"), "utf8")).planId ?? "";
  } catch {
    return "";
  }
})();

async function joinPlanAsGuest(page: Page, name: string): Promise<void> {
  await page.goto(`/plan/${PLAN_ID}`);
  const nameInput = page.getByPlaceholder("Your name");
  const gate = await nameInput.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  if (gate) {
    await nameInput.fill(name);
    await page.getByRole("button", { name: "Start voting" }).click();
  }
  await expect(page.getByText(/\d+ (?:person|people) voting/)).toBeVisible({ timeout: 20_000 });
}

const voterCount = async (page: Page): Promise<number> => {
  const text = await page.getByText(/\d+ (?:person|people) voting/).textContent();
  return Number(text?.match(/(\d+)\s+(?:person|people)/)?.[1] ?? NaN);
};

test("a second client sees the first client's vote without reloading", async ({ browser }) => {
  test.skip(!PLAN_ID, "no local fixture — see tests/README.md");

  // Separate contexts, not just separate pages: each needs its own anonymous
  // session and its own participant identity, the way two phones would.
  const [contextA, contextB] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([contextA.newPage(), contextB.newPage()]);

  try {
    await joinPlanAsGuest(pageA, `Ana ${Date.now()}`);
    await joinPlanAsGuest(pageB, `Ben ${Date.now()}`);

    const before = await voterCount(pageB);

    // A votes. B does nothing at all -- no reload, no navigation, no click.
    // Anything B observes from here can only have arrived over the socket.
    const firstCard = pageA.locator(".vote-options-grid button.token").first();
    await expect(firstCard).toHaveAttribute("aria-pressed", "false");
    await firstCard.click();
    await expect(firstCard).toHaveAttribute("aria-pressed", "true");

    await expect
      .poll(() => voterCount(pageB), {
        timeout: 15_000,
        message: "B never saw A's vote — Realtime is not delivering (check REPLICA IDENTITY, migration 045)",
      })
      .toBe(before + 1);

    // B's own card must NOT be marked as voted: A's vote is A's. This
    // separates "the socket delivered a change" from "the UI confused two
    // participants for one", which a shared count alone would not catch.
    await expect(pageB.locator(".vote-options-grid button.token").first())
      .toHaveAttribute("aria-pressed", "false");

    // ── The half that actually regresses ─────────────────────────────────
    // The INSERT assertion above passes with OR without migration 045, so on
    // its own it is the same false comfort as the single-client spec. A
    // DELETE is the case replica identity governs: its WAL record carries
    // only the old row's replica identity, so under `default` Realtime
    // cannot evaluate the filter or RLS and drops it silently.
    //
    // Clicking the chosen card again clears the pick (cast_plan_vote with
    // p_value:false, which DELETEs). Measured: under `default` B stays on 1
    // forever; under `full` B returns to 0. This assertion is the one that
    // fails if 045 is ever reverted.
    await firstCard.click();
    await expect(firstCard).toHaveAttribute("aria-pressed", "false");

    await expect
      .poll(() => voterCount(pageB), {
        timeout: 15_000,
        message: "B never saw A's vote being CLEARED — DELETEs are not propagating, "
          + "which means REPLICA IDENTITY is back to default (migration 045)",
      })
      .toBe(before);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});
