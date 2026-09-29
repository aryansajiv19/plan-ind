import { test, expect } from "@playwright/test";

// Signed out, the public pages show only our own photos (item 15): a Google
// Places photo costs the shared daily cap (300/day, ~15 per landing view
// before this), and past a visitor's limit it answered 429 and left an empty
// dark frame. So: no request to /api/spots/:id/photo at all, and every wall
// card is either a photo that actually loaded, its category art (wave 1a:
// .category-art, an SVG scene), or the typographic tile, never a photo frame
// with nothing in it. Scrolled through the whole page first,
// because the wall and the composer mount only near the viewport.

for (const path of ["/", "/demo"]) {
  test(`${path} signed out: no Google photo requests, and no empty photo frames on the wall`, async ({ page }) => {
    test.setTimeout(60_000);
    const photoRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/spots\/[^/]+\/photo/.test(new URL(request.url()).pathname)) photoRequests.push(request.url());
    });
    await page.goto(path);

    const tiles = page.locator("#right-now article.wall-tile");
    // Walk down the page until the wall mounts (NearViewport), then visit every card.
    await expect(async () => {
      await page.mouse.wheel(0, 1200);
      expect(await tiles.count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
    const count = await tiles.count();
    for (let i = 0; i < count; i += 1) {
      const tile = tiles.nth(i);
      await tile.scrollIntoViewIfNeeded();
      const typographic = await tile.evaluate((el) => el.classList.contains("wall-tile--typographic"));
      if (typographic) {
        await expect(tile.locator(".wall-tile__photo"), `card ${i} is typographic but has a photo frame`).toHaveCount(0);
        continue;
      }
      const frame = tile.locator(".wall-tile__photo");
      const img = frame.locator("img");
      await expect(img.or(frame.locator(".category-art")).first(), `card ${i} has a photo frame with nothing in it`)
        .toBeVisible({ timeout: 10_000 });
      if (await img.count()) {
        await expect.poll(() => img.first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
          { message: `card ${i}'s photo never loaded`, timeout: 10_000 }).toBe(true);
      }
    }
    // The rest of the page too (the composer deck), then the verdict.
    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(2_000); // a Google photo is fetched as its card nears the viewport
    expect(photoRequests, "signed out must never spend the Google photo cap").toEqual([]);
  });
}
