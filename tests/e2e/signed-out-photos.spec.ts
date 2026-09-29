import { test, expect } from "@playwright/test";

// Signed out, the public pages show Google photos too (owner, 2026-09-29:
// every place has a picture; the site cap is 1,500/day since 092). What must
// never happen: a photo frame with nothing in it. Every wall card is a photo
// that actually loaded, its category art (.category-art, an SVG scene, which
// is also what a refused or over-quota Google photo falls back to), or the
// typographic tile. Scrolled through the whole page first,
// because the wall and the composer mount only near the viewport.

for (const path of ["/", "/demo"]) {
  test(`${path} signed out: no empty photo frames on the wall`, async ({ page }) => {
    test.setTimeout(60_000);
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
  });
}
