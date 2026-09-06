import { test, expect } from "@playwright/test";

// Visual regression baselines for the public pages, at the four widths the
// owner named. Sibling to layout-consistency.spec.ts: that one asserts
// invariants that hold in any design (overflow, touch floor, focus), this one
// catches unintended *appearance* change, which no invariant can express.
//
// ─────────────────────────────────────────────────────────────────────────
// BASELINES ARE NOT COMMITTED YET, DELIBERATELY.
//
// Run `npm run test:visual:update` to generate them. Do NOT do that until the
// v7 palette, the Cormorant type pass and the §21 colour rework have all
// landed. A baseline captured mid-redesign is invalidated by the next commit,
// and a suite that is always red teaches everyone to ignore it -- which is
// worse than not having it. Until baselines exist these tests skip rather
// than fail, so CI stays honest about what is actually covered.
// ─────────────────────────────────────────────────────────────────────────
//
// Only chromium runs these. Font rasterisation and form-control rendering
// differ per engine, so cross-engine baselines produce diffs that are about
// the engine rather than the app -- exactly the noise that gets a suite
// muted. Cross-engine *behaviour* is covered by the other specs, which run
// on all five projects.

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1280", width: 1280, height: 900 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

const PAGES = [
  { name: "front-door", path: "/" },
  { name: "login", path: "/login" },
  { name: "privacy", path: "/privacy" },
  { name: "terms", path: "/terms" },
] as const;

test.describe("visual regression", () => {
  test.skip(
    process.env.VISUAL_BASELINES !== "true",
    "Baselines not generated yet -- see the header comment. Set VISUAL_BASELINES=true once the redesign has landed.",
  );

  for (const page_ of PAGES) {
    for (const vp of VIEWPORTS) {
      test(`${page_.name} @ ${vp.name}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "baselines are chromium-only by design");
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(page_.path, { waitUntil: "networkidle" });
        // The hero runs an entrance animation and the app respects
        // prefers-reduced-motion, so force the reduced branch rather than
        // sleeping and hoping -- otherwise the baseline captures whatever
        // frame the animation happened to be on and every run differs.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page).toHaveScreenshot(`${page_.name}-${vp.name}.png`, {
          fullPage: true,
          // Sub-pixel text rendering varies slightly between runs on the same
          // engine; this tolerance ignores that without hiding real change.
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
        });
      });
    }
  }
});
