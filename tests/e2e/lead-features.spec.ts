import { test, expect, type Page } from "@playwright/test";
import { districtFor } from "@/lib/dubai-explored";
import { PLACES } from "@/components/demo/demoFixtures";

// 2026-09-29's lead features, end to end on the account-free demo (fixtures
// only, no database, so it runs against any target): Your Dubai on Been,
// Plan Personality on Profile, the route map and the "Plan locked" stamp on
// /demo/vote's decided screen, and no emoji in any page's nav or buttons
// (owner rule: they read as cheap).

const EMOJI = /\p{Extended_Pictographic}/u;

test.describe("Your Dubai", () => {
  test("lights the sample visits' districts, counts its icons honestly, and points at an unvisited one", async ({ page }) => {
    await page.goto("/demo?view=been");
    const card = page.locator("#workspace section.explored");
    await expect(card).toBeVisible({ timeout: 20_000 });

    // The districts marked visited are exactly the sample visits' districts.
    const lit = (await card.locator(".explored__district[data-been] .explored__name").allInnerTexts()).sort();
    const expected = [...new Set(PLACES.map((place) => districtFor(place.area)).filter(Boolean))].sort();
    expect(lit).toEqual(expected);
    await expect(card.locator(".explored__percent span")).toContainText(`${lit.length} of`);

    // "X of N" icons, the progress bar and the ticked list all agree.
    const icons = card.locator(".explored__icon-list li");
    const done = await card.locator(".explored__icon-list li[data-done]").count();
    await expect(card.locator(".explored__icons-head span")).toHaveText(`${done} of ${await icons.count()}`);
    const bar = card.getByRole("progressbar", { name: "Dubai icons done" });
    await expect(bar).toHaveAttribute("aria-valuenow", String(done));
    await expect(bar).toHaveAttribute("aria-valuemax", String(await icons.count()));

    // "Next up" is a district not yet visited.
    const next = await card.locator(".explored__next strong").innerText();
    const unvisited = await card.locator(".explored__district:not([data-been]) .explored__name").allInnerTexts();
    expect(unvisited).toContain(next);
    expect(lit).not.toContain(next);
  });
});

test.describe("Plan Personality", () => {
  test("is unlocked, emoji-free, and shares its text through the share sheet", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ text }: { text: string }) => { (window as unknown as { shared: string }).shared = text; },
      });
    });
    await page.goto("/demo?view=profile");
    const card = page.locator("#workspace section.personality");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).not.toHaveClass(/personality--locked/);
    await expect(card.locator(".personality__title")).not.toBeEmpty();
    expect(await card.locator(".personality__traits li").count()).toBeGreaterThan(0);
    expect(await card.innerText()).not.toMatch(EMOJI);

    await card.getByRole("button", { name: "Share" }).click();
    await expect(card.getByRole("button", { name: "Copied" })).toBeVisible();
    const shared = await page.evaluate(() => (window as unknown as { shared?: string }).shared);
    expect(shared).toMatch(/^\S+'s Dubai Plan Personality: \S/);
    expect(shared).toContain(await card.locator(".personality__title").innerText());
  });

  test("falls back to the clipboard where there is no share sheet", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } },
      });
    });
    await page.goto("/demo?view=profile");
    const card = page.locator("#workspace section.personality");
    await card.getByRole("button", { name: "Share" }).click({ timeout: 20_000 });
    await expect(card.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { copied?: string }).copied)).toMatch(/^\S+'s Dubai Plan Personality: \S/);
  });
});

// The dinner deck, first card each round (FRIEND_PICKS is fixed, so the
// winner is too). Returns the winner's name once the reveal has settled.
async function voteToWinner(page: Page) {
  await page.goto("/demo/vote");
  await page.getByRole("button", { name: /^Dinner\b/ }).click();
  await page.getByRole("button", { name: "Deal nine" }).click();
  await page.getByRole("button", { name: "Start round one" }).click();
  const cards = page.locator(".vote-options-grid .vote-option__choice");
  const primary = page.locator("button.vote-primary-action");
  for (const next of ["Continue to round 2", "Continue to round 3", "Build the final shortlist", "Choose the final place"]) {
    await expect(cards).toHaveCount(3, { timeout: 20_000 });
    await cards.first().click();
    if (next !== "Choose the final place") await expect(primary).toHaveText(next);
    await primary.click();
  }
  await expect(page.locator("canvas.winner-reveal__canvas")).toHaveCount(0, { timeout: 20_000 });
  return page.locator("h2.winner-reveal__name").innerText();
}

test.describe("the decided sample plan", () => {
  test("stamps the plan locked with its when-line once the reveal settles", async ({ page }) => {
    await voteToWinner(page);
    await expect(page.locator(".winner-reveal__lock")).toHaveText("Plan locked");
    await expect(page.locator(".winner-reveal__when")).not.toBeEmpty();
  });

  test("draws the route with a badge per step, survives every mode, and replays", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await voteToWinner(page);

    const route = page.locator("figure.route-journey");
    await route.scrollIntoViewIfNeeded();
    await expect(route).toBeVisible({ timeout: 20_000 });
    const badges = route.locator(".route-journey__note");
    const steps = route.locator(".route-journey__steps li");
    await expect(badges).toHaveCount(await steps.count());
    expect(await steps.count()).toBeGreaterThan(0);

    const modes = page.getByRole("group", { name: "How you’re getting there" });
    for (const mode of ["Drive", "Walk", "Metro", "Drive"]) {
      await modes.getByRole("button", { name: mode }).click();
      await expect(modes.getByRole("button", { name: mode })).toHaveAttribute("aria-pressed", "true");
      await expect(badges).toHaveCount(await steps.count());
      await page.waitForTimeout(400); // let the step timers fire into the new route
    }
    // Driving ends at the door: parking, or a drop-off.
    await expect(steps.last()).toHaveText(/^(Park: .+|Drop off at the entrance)$/);

    // Replay: the caption clears, then the run starts again from step 1.
    const now = route.locator(".route-journey__now");
    await expect(now).toBeVisible({ timeout: 10_000 });
    await route.getByRole("button", { name: "Replay" }).click();
    await expect(now).toHaveCount(0);
    await expect(now.locator("span")).toHaveText("1", { timeout: 5_000 });
    expect(errors).toEqual([]);
  });

  test("under reduced motion the whole route is simply shown: every badge, no caption", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await voteToWinner(page);
      const route = page.locator("figure.route-journey");
      await route.scrollIntoViewIfNeeded();
      const badges = route.locator(".route-journey__note");
      await expect(badges.first()).toBeVisible({ timeout: 20_000 });
      for (const badge of await badges.all()) await expect(badge).toBeVisible();
      await page.waitForTimeout(1500);
      await expect(route.locator(".route-journey__now")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test("no page in the visual set puts an emoji in its nav or buttons", async ({ page }) => {
  for (const path of ["/", "/demo", "/demo/vote", "/login", "/privacy", "/terms"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const texts = await page.locator("nav, button, [role=tab], a[role=button]").allInnerTexts();
    const offenders = texts.filter((text) => EMOJI.test(text));
    expect(offenders, `${path} has emoji in its controls`).toEqual([]);
  }
});
