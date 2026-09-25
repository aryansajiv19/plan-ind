import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { planIdFor, NO_FIXTURE_REASON } from "./fixture";
import { signInAsMember } from "./local-stack";

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
const PLAN_ID = planIdFor("realtime");

// Each participant is a separate PERMANENT account in its own browser
// context (no shared storage), the way two friends' phones are. Anonymous
// guests are gone (owner decision 2026-09-25, migration 064): a context
// without an account session would be redirected to /login by proxy.ts.
async function joinPlanAsMember(browser: Browser, baseURL: string, name: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await signInAsMember(context, baseURL, name);
  const page = await context.newPage();
  await page.goto(`/plan/${PLAN_ID}`);
  // "Hey <name>" is the header's own proof this account is on the vote
  // screen (the "N people voting" line it used to wait on was removed in
  // 82145e0). Exact, so a greeting for the wrong account cannot pass.
  await expect(page.getByText(`Hey ${name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

// Read from the first card's "N yes" (the card A votes on) since the header
// count was removed in 82145e0. Same signal on this fixture plan: 0 -> 1 on
// A's vote, back to 0 on the withdrawal.
const voterCount = async (page: Page): Promise<number> => {
  const text = await page.locator(".vote-options-grid button.token").first().innerText();
  return Number(text.match(/(\d+)\s*yes/)?.[1] ?? NaN);
};

test("a second client sees the first client's vote without reloading", async ({ browser, baseURL }) => {
  test.skip(!PLAN_ID, NO_FIXTURE_REASON);

  // Separate contexts, not just separate pages: each needs its own account
  // session and its own participant identity, the way two phones would.
  const contexts: BrowserContext[] = [];
  try {
    const a = await joinPlanAsMember(browser, baseURL!, `Ana ${Date.now()}`);
    contexts.push(a.context);
    const b = await joinPlanAsMember(browser, baseURL!, `Ben ${Date.now()}`);
    contexts.push(b.context);
    const [pageA, pageB] = [a.page, b.page];

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
    await Promise.all(contexts.map((c) => c.close()));
  }
});
