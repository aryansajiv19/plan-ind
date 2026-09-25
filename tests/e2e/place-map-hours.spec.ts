import { test, expect, type Page } from "@playwright/test";
import { canProvision, SEEDED } from "./plan-factory";

// /place/[id]: the venue map is LAZY (VenueMap.tsx) -- no Google iframe until
// the section nears the viewport or "Show map" is pressed -- and the hours
// line reads the listing against the Dubai clock (OpenStatus.tsx).
//
// The iframe's src is asserted, never its content: www.google.com does not
// load from the sandbox this was written in, and the contract being tested
// is ours (which origin, which place, what title), not Google's.
//
// The clock is FIXED per test (page.clock.setFixedTime), so "Closes in 20
// min" is deterministic. Only Date is frozen; timers still run.

test.skip(!canProvision(), "skipped: reads a seed.sql spot id that exists only on a local stack.");

const PLACE = `/place/${SEEDED.threeFils}`; // 3Fils, Jumeirah, open till 11pm, no coordinates
const dubai = (hhmm: string) => new Date(`2026-09-25T${hhmm}:00+04:00`);

async function shortViewport(page: Page) {
  // Short enough on every project that the Where section starts well below
  // the fold plus VenueMap's 160px rootMargin.
  const width = page.viewportSize()?.width ?? 1280;
  await page.setViewportSize({ width, height: 420 });
}

test("the map is not loaded until scrolled to, then embeds this place from www.google.com", async ({ page }) => {
  await shortViewport(page);
  await page.clock.setFixedTime(dubai("22:40"));
  await page.goto(PLACE);

  // Hydrated: only the client can know it is 22:40 in Dubai.
  await expect(page.getByText("Closes in 20 min", { exact: true })).toBeVisible({ timeout: 20_000 });

  const map = page.locator('iframe[title^="Map of "]');
  const showMap = page.getByRole("button", { name: "Show map" });
  await expect(showMap).toBeAttached();
  // Give an eager observer every chance to fire before asserting it did not.
  await page.waitForLoadState("networkidle");
  await expect(map).toHaveCount(0);

  // A plain scroll, not a click: the observer alone must swap the map in.
  await showMap.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(map).toHaveCount(1);
  await expect(showMap).toHaveCount(0);
  await expect(map).toHaveAttribute("title", "Map of 3Fils, Jumeirah");
  const src = new URL((await map.getAttribute("src"))!);
  expect(src.protocol).toBe("https:");
  expect(src.hostname).toBe("www.google.com");
  expect(src.searchParams.get("output")).toBe("embed");
  // No coordinates in the seed row, so the query is the name and area.
  expect(src.searchParams.get("q")).toBe("3Fils, Jumeirah, Dubai");
});

test("\"Show map\" loads the map on request", async ({ page }) => {
  await shortViewport(page);
  await page.goto(PLACE);
  await page.waitForLoadState("networkidle");
  const map = page.locator('iframe[title="Map of 3Fils, Jumeirah"]');
  await expect(map).toHaveCount(0);
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(map).toHaveCount(1);
  expect(new URL((await map.getAttribute("src"))!).hostname).toBe("www.google.com");
});

test("the hours line follows the Dubai clock: listed, closing soon, closed", async ({ page }) => {
  const meta = page.locator(".place-meta");

  await page.clock.setFixedTime(dubai("18:00"));
  await page.goto(PLACE);
  await expect(page.getByRole("heading", { level: 1, name: "3Fils" })).toBeVisible({ timeout: 20_000 });
  await expect(meta).toContainText("Open till 11pm");

  await page.clock.setFixedTime(dubai("22:40"));
  await page.reload();
  await expect(meta.getByText("Closes in 20 min", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(meta).not.toContainText("Open till 11pm");

  await page.clock.setFixedTime(dubai("23:30"));
  await page.reload();
  await expect(meta.getByText("Closed now. Usually open till 11pm", { exact: true })).toBeVisible({ timeout: 20_000 });
});
