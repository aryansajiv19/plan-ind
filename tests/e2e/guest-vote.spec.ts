import { test, expect } from "@playwright/test";
import { planIdFor, NO_FIXTURE_REASON } from "./fixture";
import { signInAsMember } from "./local-stack";

// A friend's vote, end to end: a signed-in account opens the share link ->
// claim_plan_access -> the vote screen greets them by their account name ->
// they cast a vote -> the card flips to aria-pressed="true" and its count
// goes up. This is the product's delivery item #1, and mostly a mobile path,
// which is why the matrix in playwright.config.ts runs it on WebKit and two
// phone profiles.
//
// "Guest" in the file name is historical: since the owner decision of
// 2026-09-25 there are no anonymous guests. Everyone who opens a plan holds a
// permanent account (proxy.ts redirects anyone else to /login, migration 064
// refuses anonymous sessions), so the friend here is a real local account
// with its session injected -- see local-stack.ts for why not the OTP UI.
//
// ── Why this does not touch the live project ─────────────────────────────
//
// `plans` and `votes` have NO delete policy and this project has no
// service-role key, so nothing can remove a plan or a vote from a hosted
// project once created. The fixture is a disposable plan on the LOCAL stack,
// created by global-setup.ts and deleted by global-teardown.ts; setup
// provisions nothing against a non-loopback URL, so this skips there.
//
// Because the plan is private to this spec, the count assertion is EXACT
// (0 -> 1) instead of "went up by at least one".
const PLAN_ID = planIdFor("guest-vote");

test("a signed-in friend can open a shared plan and cast a vote", async ({ page, context, baseURL }) => {
  test.skip(!PLAN_ID, NO_FIXTURE_REASON);

  const me = await signInAsMember(context, baseURL!, `Friend ${Date.now()}`);
  await page.goto(`/plan/${PLAN_ID}`);

  // Signed in, so no detour through /login, and the account's display name
  // is the voter name: the screen greets it and never asks for one. The name
  // gate now appears only on a clash with someone already on the plan.
  await expect(page).toHaveURL(new RegExp(`/plan/${PLAN_ID}$`));
  await expect(page.getByText(`Hey ${me.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("Your name")).toHaveCount(0);

  // The header's "N people voting" was removed in 82145e0; the count now
  // comes from the voted card's own "N yes" (0 -> 1 on this run's plan).
  const votersLabel = page.locator(".vote-options-grid button.token").first();
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
  await expect(firstCard).toHaveAttribute("aria-pressed", "false"); // fresh account, nothing voted yet
  await firstCard.click();
  await expect(firstCard).toHaveAttribute("aria-pressed", "true");

  // Exact, not "greater than": this plan belongs to this spec alone, so a
  // second voter appearing would be a real bug rather than a parallel run.
  await expect
    .poll(async () => readVoterCount(votersLabel), { timeout: 5_000 })
    .toBe(votersBefore + 1);

  // §25.3 beat 1 / §25.7: the voter's face flies from the presence row onto
  // the card. What matters here is not that it moved but where it ENDS —
  // the FLIP animates from an offset back to the element's real layout
  // position and must leave nothing behind, so a friend who backgrounds the
  // tab mid-flight comes back to a landed avatar rather than one stranded in
  // transit. An inline transform surviving here is that bug.
  const faces = page.locator("[data-face-name]");
  await expect(faces.first()).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>("[data-face-name]")).filter((node) => {
            const t = getComputedStyle(node).transform;
            return node.style.transform !== "" || (t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)");
          }).length,
        ),
      { timeout: 5_000, message: "faces left with a residual transform after the flight" },
    )
    .toBe(0);

  // Round trip: reload and the vote is still this account's. A signed-in
  // voter is recognised by account on return, not re-asked for a name.
  await page.reload();
  await expect(page.getByText(`Hey ${me.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("Your name")).toHaveCount(0);
  await expect(page.locator(".vote-options-grid button.token").first()).toHaveAttribute("aria-pressed", "true");
});

async function readVoterCount(locator: import("@playwright/test").Locator): Promise<number> {
  const text = await locator.innerText();
  return Number(text.match(/(\d+)\s*yes/)?.[1] ?? NaN);
}
