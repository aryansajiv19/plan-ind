import { test, expect, type Page } from "@playwright/test";
import { mountLandingSection } from "./page-helpers";

// The /demo account's tabs agree with each other: every number is what the
// tabs actually list (no invented totals), the Wrapped strip names the months
// its visits are in, and the sample member's initials are theirs. Fixture
// only, so it runs against any target.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Scoped to #workspace: while a view streams in, React parks a hidden copy in
// a <div hidden id="S:0">, which a bare selector would count twice.
const number = async (page: Page, scope: string, label: RegExp) =>
  Number(await page.locator(`#workspace ${scope} span`, { hasText: label }).first().locator("strong").innerText());

test("the demo account's numbers are the ones its tabs list", async ({ page }) => {
  await page.goto("/demo?view=been");
  const visits = page.locator("#workspace article.demo-visit");
  await expect(visits.first()).toBeVisible({ timeout: 20_000 });
  const visitCount = await visits.count();
  const places = new Set(await visits.locator("h2").allInnerTexts()).size;
  await expect(page.locator("#workspace h1")).toHaveText(`${places} places, properly remembered.`);
  expect(await number(page, ".demo-account-stats", /photos/)).toBe(visitCount);
  await expect(page.getByRole("tab", { name: /^All places/ })).toContainText(String(visitCount));
  const dates = await visits.locator(".demo-visit__top span").allInnerTexts();

  await page.goto("/demo?view=friends");
  const friendRows = page.locator("#workspace article.demo-friend-row");
  await expect(friendRows.first()).toBeVisible();
  const friendCount = await friendRows.count();

  await page.goto("/demo?view=profile");
  await expect(page.locator("#workspace .demo-profile-stats")).toBeVisible();
  expect(await number(page, ".demo-profile-stats", /places/)).toBe(places);
  expect(await number(page, ".demo-profile-stats", /friends/)).toBe(friendCount);
  expect(await number(page, ".demo-profile-stats", /photos/)).toBe(visitCount);
  // The area bars account for exactly the places listed.
  const perArea = await page.locator("#workspace .demo-area-list small").allInnerTexts();
  expect(perArea.reduce((sum, text) => sum + Number.parseInt(text, 10), 0)).toBe(visitCount);

  // Wrapped is named for the months the visits are in (Been shows "02 Aug 2026").
  const months = [...new Set(dates.map((date) => MONTHS.findIndex((m) => date.toLowerCase().includes(m.slice(0, 3).toLowerCase()))))].sort((a, b) => a - b);
  const period = months.length === 1 ? MONTHS[months[0]] : `${MONTHS[months[0]]} to ${MONTHS[months[months.length - 1]]}`;
  await expect(page.locator("#workspace .demo-photo-strip h2")).toHaveText(`Your ${period} in Dubai`);

  // Two words, two initials: "Sample member" is SM, not the first two letters.
  await expect(page.locator("#workspace .demo-profile-avatar")).toHaveText("SM");
});

test("Plan together carries the friend into the composer", async ({ page }) => {
  await page.goto("/demo?view=friends");
  const first = page.locator("#workspace article.demo-friend-row").first();
  const name = await first.locator("h2").innerText();
  await first.getByRole("button", { name: "Plan together" }).click();
  await mountLandingSection(page, "plan-lab");
  await expect(page.getByText(`Set up for a plan with ${name}.`, { exact: false })).toBeVisible();
  await expect(page.locator(".plan-tune > summary")).toContainText(`“${name.split(" ")[0]}, where to?”`);
});

test("the demo's Saved tab files its sample boards in sample folders; Discover holds neither", async ({ page }) => {
  await page.goto("/demo?view=saved");
  const folders = page.locator("#workspace section.saved-folders");
  await expect(folders).toBeVisible({ timeout: 20_000 });
  await expect(folders.getByRole("heading", { level: 2 })).toContainText("sample");
  const groups = folders.locator(".saved-folders__group");
  await expect(groups).toHaveCount(3);
  // Every folder holds something, and the boards it names are the demo's own boards.
  for (const group of await groups.all()) await expect(group.locator("li")).not.toHaveCount(0);
  const filed = (await folders.locator("li").allInnerTexts()).filter((text) => text.endsWith("Moodboard")).map((text) => text.split(" · ")[0]);
  expect(filed.length).toBeGreaterThan(0);
  for (const name of filed) {
    await expect(page.locator("#workspace").getByText(name, { exact: true }).first(), `${name} is filed but not shown as a board`).toBeVisible();
  }

  await page.goto("/demo?view=discover");
  await expect(page.locator("#workspace h1")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#workspace section.saved-folders"), "folders belong on Saved").toHaveCount(0);
  for (const name of filed) await expect(page.locator("#workspace").getByText(name, { exact: true }), `${name} still on Discover`).toHaveCount(0);
});

test("the demo's Been game ranks a sample place in the page alone, and scores it by 085's rule", async ({ page }) => {
  const rpcs: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/rest/v1/")) rpcs.push(request.url()); });
  await page.goto("/demo?view=been");
  const pending = page.locator("#workspace .my-ranking__pending");
  await expect(pending.getByRole("heading", { name: /Rate your places/ })).toContainText("1", { timeout: 20_000 });
  const loved = page.locator("#workspace .my-ranking__band[data-bucket=loved] li");
  await expect(loved).toHaveCount(2);
  await expect(loved.nth(0)).toContainText("10.0");
  await expect(loved.nth(1)).toContainText("8.5");

  // Ninive, loved, better than both: two taps (ceil(log2 3)), then the chips.
  await pending.getByRole("button", { name: /Ninive/ }).click();
  const game = page.getByRole("region", { name: "Rate Ninive" });
  await game.locator('.rate-game__bucket[data-bucket="loved"]').click();
  for (let tap = 0; tap < 2; tap += 1) await game.locator(".rate-game__card").filter({ hasText: "Ninive" }).click();
  await game.getByRole("button", { name: "Rank it" }).click();
  await expect(game.locator(".rate-game__score")).toHaveText("10.0/10");
  await expect(game).toContainText("#1 of your loved places");

  // Three loved places score 10, 9, 8; nothing is left to rate.
  await expect(loved).toHaveCount(3);
  await expect(loved.nth(0)).toContainText("Ninive");
  expect(await loved.locator(".my-ranking__score").allInnerTexts()).toEqual(["10.0", "9.0", "8.0"]);
  await expect(pending).toHaveCount(0, { timeout: 10_000 });

  // Taking it out rescores the rest and offers it again.
  await page.getByRole("button", { name: "Remove Ninive from your ranking" }).click();
  expect(await loved.locator(".my-ranking__score").allInnerTexts()).toEqual(["10.0", "8.5"]);
  await expect(pending.getByRole("button", { name: /Ninive/ })).toBeVisible();
  expect(rpcs).toEqual([]); // sample data: the database is never asked
});

test("the demo's Friends leaderboard is sample people, labelled so, with your row marked", async ({ page }) => {
  await page.goto("/demo?view=friends");
  const boards = page.locator("#workspace section.boards");
  await expect(boards.getByRole("heading", { name: /Leaderboards · sample/ })).toBeVisible({ timeout: 20_000 });
  await expect(boards).toContainText("Sample people, not real members.");
  const me = boards.locator(".boards__row[data-me]");
  await expect(me).toHaveCount(1);
  await expect(me).toContainText("You");

  await boards.getByRole("tab", { name: "All Dubai" }).click();
  await boards.getByRole("button", { name: "All time" }).click();
  await expect(boards.locator(".boards__row").first().locator(".boards__rank[data-top]")).toHaveText("1");
  await expect(me).toContainText("330 pts");

  // By place ranks by how each of you felt, not points, and has no period.
  await boards.getByRole("tab", { name: "By place" }).click();
  await expect(boards.getByRole("group", { name: "Period" })).toHaveCount(0);
  await expect(me).toContainText("Loved it");
  await expect(boards.locator(".boards__points", { hasText: "pts" })).toHaveCount(0);
});

test("the demo's Discover is the real catalogue: a sample Top places, a photo wall, and a Grid/Map toggle", async ({ page }) => {
  await page.goto("/demo?view=discover");
  const top = page.locator("#workspace section.top-places");
  await expect(top.getByRole("heading", { name: /Top places in Dubai · sample/ })).toBeVisible({ timeout: 20_000 });
  await expect(top).toContainText("Sample scores on real places.");
  const scores = (await top.locator(".top-places__card b").allInnerTexts()).map(Number);
  expect(scores.length).toBeGreaterThan(0);
  expect(scores, "best first").toEqual([...scores].sort((a, b) => b - a));

  // Grid: the landing's wall, one tile per place.
  const tiles = page.locator("#workspace .wall .wall-tile");
  await expect(tiles.first()).toBeVisible();
  const tileCount = await tiles.count();
  expect(tileCount).toBeGreaterThan(0);
  expect(tileCount, "a page at a time, not the whole catalogue").toBeLessThanOrEqual(24);

  // Map: the wall goes, the places are stars (or it says none is located yet).
  const toggle = page.getByRole("group", { name: "Show places as" });
  await toggle.getByRole("button", { name: "Map" }).click();
  await expect(toggle.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#workspace .wall")).toHaveCount(0);
  const sky = page.locator("#workspace figure.explore-sky");
  if (await sky.count()) {
    const stars = sky.locator("a.explore-sky__star");
    expect(await stars.count()).toBeGreaterThan(0); // the map shows every match, not just the first page
    await expect(stars.first()).toHaveAttribute("href", /^\/place\/[0-9a-f-]{36}$/);
  } else {
    await expect(page.locator("#workspace")).toContainText("None of these places has a location yet.");
  }
  await toggle.getByRole("button", { name: "Grid" }).click();
  await expect(tiles).toHaveCount(tileCount);

  // A filter narrows the wall to that category.
  const filters = page.getByLabel("Filter places").getByRole("button");
  await filters.nth(1).click();
  await expect.poll(() => tiles.count()).toBeLessThan(tileCount);

  // Back to All starts again at the first page; Show more adds the next one.
  await filters.first().click();
  await expect(tiles).toHaveCount(tileCount);
  const more = page.getByRole("button", { name: /^Show \d+ more/ });
  if (await more.count()) {
    await more.click();
    await expect.poll(() => tiles.count()).toBeGreaterThan(tileCount);
  }
});

test("a demo Discover tile opens the real place page", async ({ page }) => {
  await page.goto("/demo?view=discover");
  const link = page.locator("#workspace .wall .wall-tile__link").first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  const name = (await link.getAttribute("aria-label"))!;
  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^\/place\/[0-9a-f-]{36}$/);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
});
