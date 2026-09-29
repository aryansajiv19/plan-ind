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
