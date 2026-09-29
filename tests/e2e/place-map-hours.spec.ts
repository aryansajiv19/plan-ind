import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { nearestStation } from "@/lib/dubai-metro";
import { canProvision, SEEDED } from "./plan-factory";
import { localAdmin } from "./local-stack";

// /place/[id]: the venue map is OUR OWN (components/map/DubaiMiniMap.tsx,
// wave 1c): an SVG of the Dubai Metro, the nearest station lit, the walk and
// the venue pin, with "Open in Google Maps" for turn-by-turn. No Google
// iframe and no key. The hours line reads the listing against the Dubai clock
// (OpenStatus.tsx).
//
// The clock is FIXED per test (page.clock.setFixedTime), so "Closes in 20
// min" is deterministic. Only Date is frozen; timers still run.

test.skip(!canProvision(), "skipped: reads and provisions spots on a local stack.");

const PLACE = `/place/${SEEDED.threeFils}`; // 3Fils, Jumeirah, open till 11pm; no coordinates in the seed
const dubai = (hhmm: string) => new Date(`2026-09-25T${hhmm}:00+04:00`);

// A curated spot a short walk from Business Bay metro, provisioned per test:
// the seed has no coordinates, and the map needs them.
const AT = { latitude: 25.1925, longitude: 55.2625 };

test("the map is ours: metro, the nearest station, the walk, the pin, and a way out to Google Maps", async ({ page }) => {
  const admin = localAdmin();
  const id = randomUUID();
  const { error } = await admin.from("spots").insert({
    id, name: "E2E Map Spot", category: "dinner", area: "Business Bay", cuisine: "Test", price_band: "$$",
    min_spend: 100, open_till: "11pm", vibe: "Fixture for the map", source: "curated", ...AT,
  });
  if (error) throw new Error(`provisioning the map spot failed: ${error.message}`);
  try {
    await page.goto(`/place/${id}`);
    const map = page.locator("figure.mini-map");
    await expect(map).toBeVisible({ timeout: 20_000 });
    const near = nearestStation(AT.latitude, AT.longitude)!;
    await expect(map.getByRole("img")).toHaveAttribute("aria-label",
      `Map: E2E Map Spot, ${near.walkMin} min walk from ${near.station.name} metro`);
    await expect(map.locator("path.mini-map__pin")).toHaveCount(1);
    await expect(map.locator("circle.mini-map__near")).toHaveCount(1);
    await expect(map.locator("figcaption")).toContainText(`≈ ${near.walkMin} min walk from ${near.station.name}`);
    const out = map.getByRole("link", { name: "Open in Google Maps" });
    const href = new URL((await out.getAttribute("href"))!);
    expect(`${href.origin}${href.pathname}`).toBe("https://www.google.com/maps/search/");
    expect(href.searchParams.get("query")).toBe(`${AT.latitude},${AT.longitude}`);
    // No Google embed anywhere on the page any more.
    await expect(page.locator("iframe")).toHaveCount(0);
  } finally {
    await admin.from("spots").delete().eq("id", id);
  }
});

test("a place without coordinates draws no map but is never a dead end", async ({ page }) => {
  await page.goto(PLACE);
  await expect(page.getByRole("heading", { level: 1, name: "3Fils" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("figure.mini-map")).toHaveCount(0);
  const where = page.locator("section", { has: page.getByRole("heading", { name: "Where" }) });
  await expect(where).toContainText("Jumeirah");
  await expect(page.getByRole("link", { name: "Open in Google Maps" }).first()).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\//);
  await expect(page.locator("iframe")).toHaveCount(0);
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
