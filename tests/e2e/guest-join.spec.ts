import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";
import { HAS_TURNSTILE_KEY, NO_KEY_REASON, REFUSALS, stubJoin, stubTurnstile, submitJoin } from "./guest-stubs";

// A friend with no account taps a plan link, types a first name and votes
// (docs/GUEST_VOTE.md). Every test here runs on a build that has a Turnstile
// site key (guest-stubs.ts says why) and the real local stack: the join route
// mints a real anonymous session and join_plan_as_guest binds it to the plan.
// Refusal states are route stubs: the cap (20 guests) and an age-gated plan are
// not worth producing for a screen check, and the server answers are unit
// tested (tests/guest-join.test.ts) and DB tested (guest-vote.dbtest.ts).
const SPOTS = [...Object.values(SEEDED), ...FILLER].slice(0, 9);

test.describe("guest join", () => {
  test.skip(!HAS_TURNSTILE_KEY, NO_KEY_REASON);

  test("a signed-out friend joins with a name, votes, and the host sees them live", async ({ browser, baseURL }) => {
    test.skip(!canProvision(), "needs the local stack: a real anonymous session and plan");
    test.setTimeout(90_000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    try {
      const host = await signInAsMember(hostContext, baseURL!, `Host ${Date.now()}`);
      await withPlan({ title: `Guest join ${Date.now()}`, spotIds: SPOTS, createdBy: host.userId }, async (planId) => {
        await localAdmin().from("plan_access").insert({ plan_id: planId, user_id: host.userId });
        const hostPage = await hostContext.newPage();
        await hostPage.goto(`/plan/${planId}`);
        await expect(hostPage.getByText(`Hey ${host.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });

        const page = await guestContext.newPage();
        await stubTurnstile(page);
        await page.goto(`/plan/${planId}`);
        // No redirect to /login: the plan link itself shows the join card,
        // with the plan's title from the server-rendered preview.
        await expect(page).toHaveURL((url) => url.pathname === `/plan/${planId}`);
        await expect(page.getByRole("heading", { name: /^Join / })).toBeVisible();
        await expect(page.getByText(/^“Guest join /)).toBeVisible();
        await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/plan/${planId}`)}`);

        // One letter is not a name; two is.
        const join = page.getByRole("button", { name: "Join and vote" });
        await page.getByLabel("Your first name").fill("D");
        await expect(join).toBeDisabled();
        await submitJoin(page, "Dana");
        await expect(page.getByText("Hey Dana", { exact: true })).toBeVisible({ timeout: 20_000 });

        const card = page.locator(".vote-options-grid .vote-option__choice").first();
        await expect(card).toHaveAttribute("aria-pressed", "false");
        await card.click();
        await expect(card).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByRole("button", { name: "Save your votes: sign in" })).toBeVisible();

        // The host never reloaded: Dana's seat arrives over Realtime.
        await expect(hostPage.locator('[data-face-name="Dana"]').first()).toBeVisible({ timeout: 20_000 });

        // Account-only actions are not offered to a guest.
        await expect(page.getByRole("button", { name: "Leave this plan" })).toHaveCount(0);
        await expect(page.getByText("Which times work for you?")).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Details" })).toHaveCount(0);

        // Round trip: a reload keeps the same guest and the same vote.
        await page.reload();
        await expect(page.getByText("Hey Dana", { exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.locator(".vote-options-grid .vote-option__choice").first()).toHaveAttribute("aria-pressed", "true");
      });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("on a decided plan a guest can RSVP but not rate, book or plan another", async ({ browser, baseURL }) => {
    test.skip(!canProvision(), "needs the local stack: a real anonymous session and plan");
    test.setTimeout(60_000);
    const context = await browser.newContext();
    try {
      await withPlan({ title: `Guest decided ${Date.now()}`, spotIds: SPOTS, status: "decided", winnerSpotId: SEEDED.threeFils, eventTime: new Date(Date.now() + 3 * 86_400_000).toISOString() }, async (planId) => {
        const page = await context.newPage();
        await stubTurnstile(page);
        await page.goto(new URL(`/plan/${planId}`, baseURL!).toString());
        await submitJoin(page, "Sami");
        await expect(page.getByText("Hey Sami", { exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("button", { name: "Copy for the group chat" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Plan another like this" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "I’ll book it" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: /story/i })).toHaveCount(0);
      });
    } finally {
      await context.close();
    }
  });

  for (const refusal of REFUSALS) {
    test(`guest join: the ${refusal.label} answer is said plainly`, async ({ browser, baseURL }) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await stubTurnstile(page);
        await stubJoin(page, refusal);
        // Any plan id: with no session the card shows before anything is read.
        const planId = randomUUID();
        await page.goto(new URL(`/plan/${planId}`, baseURL!).toString());
        await submitJoin(page, "Lena");
        await expect(page.getByRole("alert").filter({ hasText: refusal.error })).toBeVisible();
        // A refusal an account can fix offers the sign-in door; the others do not.
        await expect(page.getByRole("link", { name: "Sign in to join" })).toHaveCount(refusal.needsAccount ? 1 : 0);
        // The name stays, so a retry is one tap.
        await expect(page.getByLabel("Your first name")).toHaveValue("Lena");
      } finally {
        await context.close();
      }
    });
  }
});
