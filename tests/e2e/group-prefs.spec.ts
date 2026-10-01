import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// Group preferences (docs/GROUP_PREFS.md): the host asks first, friends answer
// three taps, the host sees the answers arrive live and deals, and the vote
// then runs as before. Real UI, real RPCs, local stack only (it mints accounts).

const CARDS = ".vote-options-grid .vote-option__choice";

test.describe("group preferences", () => {
  test.beforeEach(() => test.skip(!canProvision(), "needs the local stack to mint accounts"));

  test("the host asks, a friend answers, the host sees it live and deals; cards say why they fit", async ({ page, context, browser, baseURL }) => {
    test.setTimeout(120_000);
    await signInAsMember(context, baseURL!, `Host ${Date.now()}`);
    const friendContext = await browser.newContext();
    const lateContext = await browser.newContext();
    const admin = localAdmin();
    let planId = "";
    try {
      // The composer's default is to ask first.
      await page.goto("/home");
      await page.getByRole("button", { name: "Share and ask the group" }).click();
      await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 20_000 });
      planId = new URL(page.url()).pathname.split("/").pop()!;
      await expect(page.getByRole("heading", { name: "What works for you?" })).toBeVisible();
      const { data: created } = await admin.from("plans").select("stage").eq("id", planId).single();
      expect(created?.stage).toBe("gathering");
      const { count: placed } = await admin.from("plan_spots").select("plan_id", { count: "exact", head: true }).eq("plan_id", planId);
      expect(placed).toBe(0); // nothing is dealt until the host says so

      // Below two answers the group deal is not offered; the host's own settings still are.
      await expect(page.getByRole("button", { name: "Deal for the group" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Deal anyway with my settings" })).toBeVisible();

      // The host answers.
      await page.getByRole("button", { name: "Downtown / DIFC", exact: true }).click();
      await page.getByRole("button", { name: "Save my answers" }).click();
      await expect(page.getByRole("heading", { name: "You’re in" })).toBeVisible();
      await expect(page.getByText("1 answered")).toBeVisible();

      // A friend opens the share link and answers.
      await signInAsMember(friendContext, baseURL!, `Friend ${Date.now()}`);
      const friend = await friendContext.newPage();
      await friend.goto(`/plan/${planId}`);
      await expect(friend.getByRole("heading", { name: "What works for you?" })).toBeVisible({ timeout: 20_000 });
      await friend.getByRole("button", { name: "Downtown / DIFC", exact: true }).click();
      await friend.getByRole("button", { name: "Chill", exact: true }).click();
      await friend.getByRole("button", { name: "Save my answers" }).click();
      await expect(friend.getByRole("heading", { name: "You’re in" })).toBeVisible();
      // The friend is not the host: no deal controls.
      await expect(friend.getByRole("button", { name: "Deal for the group" })).toHaveCount(0);

      // The host sees it arrive without reloading.
      await expect(page.getByText("2 answered")).toBeVisible({ timeout: 15_000 });
      const dealt = page.waitForResponse((r) => r.url().endsWith(`/api/plans/${planId}/deal`) && r.request().method() === "POST");
      await page.getByRole("button", { name: "Deal for the group" }).click();
      expect((await dealt).status()).toBe(200);

      // Cards, each with the computed fit line, not the generic reasons.
      await expect(page.locator(CARDS)).toHaveCount(3, { timeout: 20_000 });
      await expect(page.locator(".vote-options-grid article").first().getByText(/km or less for both of you/)).toBeVisible();
      await expect(page.getByText(/^Chosen for the group: .*within \d+ km of the group’s middle$/)).toBeVisible();
      await expect(page.getByText(/Fair point/)).toHaveCount(0); // the stored label never reaches the screen
      const { data: plan } = await admin.from("plans").select("stage, group_summary").eq("id", planId).single();
      expect(plan?.stage).toBe("pool");
      expect((plan?.group_summary as { answered: number }).answered).toBe(2);
      const { count: dealtCount } = await admin.from("plan_spots").select("plan_id", { count: "exact", head: true }).eq("plan_id", planId);
      expect(dealtCount).toBe(9);

      // The friend's page, still open on the gathering screen, moves on by itself and the vote proceeds.
      await expect(friend.locator(CARDS)).toHaveCount(3, { timeout: 20_000 });
      await friend.locator(CARDS).first().click();
      await expect(friend.locator(CARDS).first()).toHaveAttribute("aria-pressed", "true");

      // A late joiner after the deal just votes: no questions.
      await signInAsMember(lateContext, baseURL!, `Late ${Date.now()}`);
      const late = await lateContext.newPage();
      await late.goto(`/plan/${planId}`);
      await expect(late.locator(CARDS)).toHaveCount(3, { timeout: 20_000 });
      await expect(late.getByRole("heading", { name: "What works for you?" })).toHaveCount(0);
    } finally {
      await friendContext.close();
      await lateContext.close();
      if (planId) await admin.from("plans").delete().eq("id", planId);
    }
  });

  test("a host with no answers deals on their own settings", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    await signInAsMember(context, baseURL!, `Solo ${Date.now()}`);
    const admin = localAdmin();
    let planId = "";
    try {
      await page.goto("/home");
      await page.getByRole("button", { name: "Share and ask the group" }).click();
      await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 20_000 });
      planId = new URL(page.url()).pathname.split("/").pop()!;
      await page.getByRole("button", { name: "Deal anyway with my settings" }).click();
      await page.getByRole("button", { name: "Deal with my settings" }).click();
      await expect(page.locator(CARDS)).toHaveCount(3, { timeout: 20_000 });
      const { count } = await admin.from("plan_spots").select("plan_id", { count: "exact", head: true }).eq("plan_id", planId);
      expect(count).toBe(9);
    } finally {
      if (planId) await admin.from("plans").delete().eq("id", planId);
    }
  });

  test("asking the group is unavailable (migration 100 not applied): the old deal completes, no error", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    await signInAsMember(context, baseURL!, `Fallback ${Date.now()}`);
    const admin = localAdmin();
    let planId = "";
    try {
      await page.route("**/api/plans/gathering", (route) => route.fulfill({
        status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Asking the group is not available yet.", code: "group_prefs_unavailable" }),
      }));
      await page.goto("/home");
      // No "Voting closes" while asking first: a gathering plan has no voting deadline to choose.
      await page.locator("summary", { hasText: "Tune it" }).click();
      await expect(page.getByText("Voting closes")).toHaveCount(0);
      await page.getByRole("button", { name: "Share and ask the group" }).click();
      // The submit becomes the old deal, transparently: a plan with nine places, three rounds.
      await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 30_000 });
      planId = new URL(page.url()).pathname.split("/").pop()!;
      await expect(page.locator(CARDS)).toHaveCount(3, { timeout: 20_000 });
      const { data } = await admin.from("plans").select("stage").eq("id", planId).single();
      expect(data?.stage).toBe("pool");
    } finally {
      if (planId) await admin.from("plans").delete().eq("id", planId);
    }
  });

  test("a failed save and a refused deal say so inline and can be retried", async ({ page, context, baseURL }) => {
    test.setTimeout(90_000);
    await signInAsMember(context, baseURL!, `Retry ${Date.now()}`);
    const admin = localAdmin();
    let planId = "";
    try {
      await page.goto("/home");
      await page.getByRole("button", { name: "Share and ask the group" }).click();
      await page.waitForURL(/\/plan\/[0-9a-f-]{36}/, { timeout: 20_000 });
      planId = new URL(page.url()).pathname.split("/").pop()!;

      let failures = 1;
      await page.route(`**/api/plans/${planId}/preferences`, (route) => failures-- > 0
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Couldn't save your answers. Try again in a moment." }) })
        : route.continue());
      await page.getByRole("button", { name: "Save my answers" }).click();
      await expect(page.locator("p[role=alert]")).toContainText("Couldn't save your answers");
      await page.getByRole("button", { name: "Try again" }).click(); // the same button, now a retry
      await expect(page.getByRole("heading", { name: "You’re in" })).toBeVisible();

      await page.route(`**/api/plans/${planId}/deal`, (route) => route.fulfill({
        status: 422, contentType: "application/json", body: JSON.stringify({ error: "Not enough places match those settings. Widen the budget or the distance." }),
      }));
      await page.getByRole("button", { name: "Deal anyway with my settings" }).click();
      await page.getByRole("button", { name: "Deal with my settings" }).click();
      await expect(page.locator("p[role=alert]")).toContainText("Widen the budget");
      await expect(page.getByRole("heading", { name: "Ready when you are" })).toBeVisible(); // still gathering, nothing half dealt
      const { data } = await admin.from("plans").select("stage").eq("id", planId).single();
      expect(data?.stage).toBe("gathering");
    } finally {
      if (planId) await admin.from("plans").delete().eq("id", planId);
    }
  });
});
