import { test, expect } from "@playwright/test";
import { pinGround } from "./page-helpers";

// Visual regression baselines for the public pages, at the four widths the
// owner named. Sibling to layout-consistency.spec.ts: that one asserts
// invariants that hold in any design (overflow, touch floor, focus), this one
// catches unintended *appearance* change, which no invariant can express.
//
// Baselines are Linux-only (`*-chromium-linux.png`), made in CI's own
// environment: font rasterisation differs per OS, so a darwin baseline would
// never match CI and CI would never use it. Regenerate after an intended
// visual change with the CI dispatch in tests/README.md ("Visual baselines"),
// never from a laptop. Elsewhere these skip, and say why.
//
// Chromium only (playwright.config.ts keeps this file out of the other
// projects): cross-engine baselines diff on the engine, not the app, which
// is the noise that gets a suite muted.

// A fixed evening in Dubai (19:30): the "Closes in N min" lines read the
// browser clock, so an unfrozen one changes pixels by the hour.
const FIXED_TIME = new Date("2026-09-26T15:30:00.000Z");

// P28 renders two things on the SERVER from the real Dubai clock, which the
// frozen browser clock can't reach: the greeting, and the "right now" wall
// (picked by what is open). Both are masked, and the wall is pinned to a
// fixed box so the page's length doesn't change with the pick either. Test
// CSS only: no production code path exists for this.
const TIME_DEPENDENT = ".cover__issue, .home-appbar__hello, #right-now .wall";
const PIN_WALL = "#right-now .wall { height: 60rem !important; overflow: hidden !important; }";

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const PAGES = [
  { name: "front-door", path: "/" },
  { name: "demo", path: "/demo" },
  { name: "demo-vote", path: "/demo/vote" },
  { name: "login", path: "/login" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
] as const;

test.describe("visual regression", () => {
  test.skip(process.platform !== "linux", "baselines are Linux (CI) only -- see the header comment");
  // Entrance animations respect prefers-reduced-motion; set it before load so
  // the page never starts the animated branch at all.
  // A context option, not a test option: `reducedMotion` at the top level of
  // test.use() is silently ignored (tsc -p tests/e2e flags it).
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  for (const page_ of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${page_.name} @ ${vp.name}`, async ({ page, baseURL }) => {
        // The server picks the ground from the real Dubai clock; pin it.
        await pinGround(page, baseURL!, "night");
        await page.clock.setFixedTime(FIXED_TIME);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(page_.path, { waitUntil: "networkidle" });
        await page.addStyleTag({ content: PIN_WALL });
        await expect(page).toHaveScreenshot(`${page_.name}-${vp.name}.png`, {
          fullPage: true,
          mask: [page.locator(TIME_DEPENDENT)],
          // Antialiasing noise: per-pixel colour tolerance (0.2 is
          // Playwright's default, stated so it is a decision) plus up to 1% of
          // pixels. Real layout or colour change moves far more than that.
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
        });
      });
    }
  }
});
