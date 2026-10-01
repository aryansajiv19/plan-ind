import { test, expect, type Page } from "@playwright/test";
import { scanPage, headingsClearNav, type Finding } from "./ui-scan";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, withGatheringPlan, SEEDED, FILLER } from "./plan-factory";

// Walks every public page and every state of the sample vote at the sizes and
// in both themes a visitor meets, and fails on the shape of the bugs the owner
// kept finding by hand (see ui-scan.ts). Signed-in screens are the same
// components fed fixtures: /demo?view=... renders them with sample data.
//
// Chromium only: the sizes are set here, so the other projects would just
// repeat the work.

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];
const THEMES = ["day", "night"] as const;

const PAGES = [
  "/",
  "/demo",
  "/demo?view=discover",
  "/demo?view=saved",
  "/demo?view=been",
  "/demo?view=friends",
  "/demo?view=profile",
  "/login",
  "/login?next=%2Fplan%2F00000000-0000-0000-0000-000000000000",
  "/login?error=google",
  "/privacy",
  "/terms",
  "/credits",
  "/this-page-does-not-exist",
  "/plan/not-a-plan-id",
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {}); // the login page never idles: Turnstile keeps polling
  await page.waitForTimeout(700); // entrance animations (the app gates content behind rAF)
}

async function check(page: Page, label: string): Promise<string[]> {
  const found: Finding[] = [...(await scanPage(page)), ...(await headingsClearNav(page))];
  return found.map((f) => `[${label}] ${f.kind}: ${f.detail}`);
}

test.describe("ui bug scan", () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "chromium", "sizes are set here"));

  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      const tag = `${theme} ${viewport.width}`;

      test(`pages: ${tag}`, async ({ browser, baseURL }) => {
        test.setTimeout(180_000); // 15 pages, a real server
        const context = await browser.newContext({ viewport });
        await context.addCookies([{ name: "deal-three-theme", value: theme, url: baseURL! }]);
        const page = await context.newPage();
        const problems: string[] = [];
        for (const path of PAGES) {
          await page.goto(path);
          await settle(page);
          problems.push(...(await check(page, `${tag} ${path}`)));
        }
        await context.close();
        expect(problems, problems.join("\n")).toEqual([]);
      });

      test(`signed in, a brand-new account and a real plan: ${tag}`, async ({ browser, baseURL }) => {
        test.skip(!canProvision(), "needs the local stack to mint an account");
        test.setTimeout(150_000);
        const context = await browser.newContext({ viewport });
        await context.addCookies([{ name: "deal-three-theme", value: theme, url: baseURL! }]);
        const page = await context.newPage();
        const stamp = Date.now();
        const member = await signInAsMember(context, baseURL!, `Scan ${stamp}`);
        const problems: string[] = [];
        // A new account has no plans, visits or friends: every empty state.
        for (const view of ["plan", "discover", "saved", "been", "friends", "profile"]) {
          await page.goto(`/home?view=${view}`);
          await settle(page);
          problems.push(...(await check(page, `${tag} /home?view=${view} (new account)`)));
        }
        // A real plan, voting and decided, as a member.
        const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
        const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();
        for (const shape of [
          { state: "voting", status: "open" as const, winnerSpotId: null, eventTime: null },
          { state: "decided", status: "decided" as const, winnerSpotId: SEEDED.threeFils, eventTime: inThreeDays },
        ]) {
          await withPlan({ title: `Scan ${shape.state} ${stamp}`, spotIds, status: shape.status, winnerSpotId: shape.winnerSpotId, eventTime: shape.eventTime, createdBy: member.userId }, async (planId) => {
            await localAdmin().from("plan_access").insert({ plan_id: planId, user_id: member.userId });
            await page.goto(`/plan/${planId}`);
            await settle(page);
            problems.push(...(await check(page, `${tag} /plan ${shape.state}`)));
          });
        }
        // Group preferences: a plan still gathering, from nobody to everyone answered, then dealt.
        const friendContext = await browser.newContext({ viewport });
        await withGatheringPlan({ title: `Scan gathering ${stamp}`, createdBy: member.userId }, async (planId) => {
          const at = async (state: string) => {
            await settle(page);
            problems.push(...(await check(page, `${tag} /plan gathering ${state}`)));
            if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/gathering-${state.replace(/\W+/g, "-")}-${theme}-${viewport.width}.png`, fullPage: true });
          };
          await page.goto(`/plan/${planId}`);
          await expect(page.getByRole("heading", { name: "What works for you?" })).toBeVisible({ timeout: 15_000 });
          await at("no answers");
          await page.getByRole("button", { name: "Downtown / DIFC", exact: true }).click();
          await page.getByRole("button", { name: "Chill", exact: true }).click();
          await page.getByRole("button", { name: "Save my answers" }).click();
          await expect(page.getByRole("heading", { name: "You’re in" })).toBeVisible();
          await at("one answer");
          const friend = clientAs(await signInAsMember(friendContext, baseURL!, `Scan friend ${stamp}`));
          await friend.rpc("claim_plan_access", { p_plan_id: planId });
          await friend.rpc("set_plan_preferences", { p_plan_id: planId, p_budget_cap: null, p_origin_value: "downtown", p_vibes: ["chill"], p_avoid: [] });
          await expect(page.getByText("2 answered")).toBeVisible({ timeout: 15_000 });
          await page.getByRole("button", { name: "Skip, use my settings" }).click();
          await at("two answers, my settings open");
          await page.getByRole("button", { name: "Skip, use my settings" }).click();
          await page.getByRole("button", { name: "Deal for the group" }).click();
          await expect(page.locator(".vote-options-grid .vote-option__choice")).toHaveCount(3, { timeout: 20_000 });
          await at("dealt, fit lines");
        });
        await friendContext.close();
        await context.close();
        expect(problems, problems.join("\n")).toEqual([]);
      });

      test(`sample vote, every step: ${tag}`, async ({ browser, baseURL }) => {
        test.setTimeout(120_000);
        const context = await browser.newContext({ viewport });
        await context.addCookies([{ name: "deal-three-theme", value: theme, url: baseURL! }]);
        const page = await context.newPage();
        const problems: string[] = [];
        const at = async (step: string) => { await settle(page); problems.push(...(await check(page, `${tag} /demo/vote ${step}`))); };

        await page.goto("/demo/vote");
        await expect(page.getByText(/^4 picked this round/)).toBeVisible({ timeout: 10_000 });
        await at("opens in round 1");
        await page.getByText("How these were chosen").click();
        await at("the group's sample answers open");
        if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/demo-group-answers-${theme}-${viewport.width}.png`, fullPage: true });
        await page.getByText("How these were chosen").click();
        // The compose and deal steps, one tap away.
        await page.getByRole("button", { name: "Pick a different night" }).click();
        await at("compose");
        await page.getByRole("button", { name: /^Dinner\b/ }).click();
        await page.getByRole("button", { name: "Deal nine" }).click();
        await expect(page.getByRole("list", { name: "Nine places in three rounds" }).locator(":scope > li > ul > li")).toHaveCount(9);
        await page.waitForTimeout(2500); // the deal reveal flips the tiles in over ~2s
        await at("dealt");
        await page.getByRole("button", { name: "Start round one" }).click();
        await expect(page.getByText(/^4 picked this round/)).toBeVisible({ timeout: 10_000 });
        const cards = page.locator(".vote-options-grid .vote-option__choice");
        const primary = page.locator("button.vote-primary-action");
        await at("round 1");
        let round = 1;
        for (const next of ["Continue to round 2", "Continue to round 3", "Build the final shortlist"]) {
          await expect(cards).toHaveCount(3, { timeout: 20_000 });
          await cards.first().click();
          await expect(primary).toHaveText(next);
          await at(`round ${round} picked`);
          await primary.click();
          round += 1;
          await expect(cards).toHaveCount(3, { timeout: 20_000 });
          await at(round <= 3 ? `round ${round}` : "final");
        }
        await cards.first().click();
        await primary.click();
        await expect(page.getByText("Decided · you’re going")).toBeVisible({ timeout: 20_000 });
        await expect(page.locator("canvas.winner-reveal__canvas")).toHaveCount(0, { timeout: 10_000 });
        await at("decided");
        await page.getByRole("button", { name: "I’ll book it" }).click();
        await at("booking claimed");
        await context.close();
        expect(problems, problems.join("\n")).toEqual([]);
      });
    }
  }
});
