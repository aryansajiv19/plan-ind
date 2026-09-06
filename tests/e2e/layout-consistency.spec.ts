import { test, expect, type Page } from "@playwright/test";

// Programmatic layout QA, run at every REAL breakpoint boundary rather than at
// round numbers. app/globals.css's media queries fire at 520, 640, 760, 850 and
// 1100px, so a layout breaks either side of those and nowhere in between --
// testing 1440/1280/768/390 alone would step straight over four of the five.
// Each boundary is probed at -1/+1 because the bug is almost always the rule
// that has just started or just stopped applying.
//
// These assert invariants, not appearance. Appearance is visual.spec.ts's job;
// this catches the things that are wrong at any size and in any design:
// horizontal overflow, controls below the touch floor, invisible focus.
//
// Deliberately public pages only: this suite runs unauthenticated so it needs
// no session and writes nothing. /home and /home-preview are excluded -- the
// first needs auth, the second calls notFound() in a production build, which is
// what the webServer config builds.

const BREAKPOINTS = [520, 640, 760, 850, 1100];
const BOUNDARY_WIDTHS = BREAKPOINTS.flatMap((bp) => [bp - 1, bp + 1]);
const NAMED_WIDTHS = [390, 768, 1280, 1440];
const WIDTHS = [...new Set([...BOUNDARY_WIDTHS, ...NAMED_WIDTHS])].sort((a, b) => a - b);

const PAGES = ["/", "/login", "/privacy", "/terms"] as const;

/** Elements wider than the viewport, or crossing either edge of it. */
async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: { sel: string; left: number; right: number; overhang: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      // An element inside its own horizontal scroller is allowed to be wider
      // than the viewport -- that is the mandated pattern for wide content.
      let scroller: HTMLElement | null = el.parentElement;
      let inScroller = false;
      while (scroller) {
        const o = getComputedStyle(scroller).overflowX;
        if (o === "auto" || o === "scroll") { inScroller = true; break; }
        scroller = scroller.parentElement;
      }
      if (inScroller) continue;
      const overhang = Math.max(r.right - vw, -r.left);
      if (overhang > 1) {
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
        offenders.push({
          sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ""),
          left: Math.round(r.left), right: Math.round(r.right), overhang: Math.round(overhang),
        });
      }
    }
    return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) };
  });
}

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`no horizontal overflow: ${path} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const result = await horizontalOverflow(page);
      expect(
        result.offenders,
        `${result.offenders.length} element(s) cross the viewport edge at ${width}px on ${path}: ` +
          JSON.stringify(result.offenders, null, 1),
      ).toEqual([]);
      // The body itself must never scroll sideways -- wide content scrolls in
      // its own container (FRONTEND_DESIGN_STANDARDS.md).
      expect(result.scrollWidth, `document scrolls horizontally at ${width}px on ${path}`)
        .toBeLessThanOrEqual(result.vw + 1);
    });
  }
}

// 44px minimum touch target, checked only where touch is the input method.
for (const path of PAGES) {
  test(`touch targets meet the 44px floor: ${path} at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const small = await page.evaluate(() => {
      const out: { sel: string; w: number; h: number; text: string }[] = [];
      const controls = "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]";
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(controls))) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) continue;
        // Inline links inside a paragraph are text, not tap targets, and the
        // 44px floor does not apply to them.
        if (el.tagName === "A" && el.closest("p")) continue;
        if (r.height < 44 - 0.5 || r.width < 44 - 0.5) {
          const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          out.push({
            sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ""),
            w: Math.round(r.width), h: Math.round(r.height),
            text: (el.textContent ?? "").trim().slice(0, 24),
          });
        }
      }
      return out.slice(0, 10);
    });
    expect(small, `controls below the 44px touch floor: ${JSON.stringify(small, null, 1)}`).toEqual([]);
  });
}

// Focus must be visible and must not be clipped by an ancestor's overflow --
// the reason the house rule specifies an INSET ring rather than an outset one.
test("keyboard focus is visible on the login form's controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const controls = page.locator("button:visible, input:visible");
  const count = Math.min(await controls.count(), 6);
  expect(count, "no focusable controls found on /login").toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    await control.focus();
    // Accepts either mechanism. The invariant under test is "focus is
    // visible at all", which is the accessibility failure; WHICH mechanism
    // draws it is a design-standards question, not a correctness one.
    // .auth-input deliberately uses a box-shadow glow rather than an outline
    // -- asserting `outline !== none` here would fail a control that is in
    // fact clearly focused, which is a false positive, not a finding.
    const ring = await control.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        outlineStyle: s.outlineStyle,
        outlineWidth: parseFloat(s.outlineWidth) || 0,
        boxShadow: s.boxShadow,
      };
    });
    const hasOutline = ring.outlineStyle !== "none" && ring.outlineWidth > 0;
    const hasShadowRing = ring.boxShadow !== "none" && ring.boxShadow !== "";
    expect(
      hasOutline || hasShadowRing,
      `control ${i} on /login shows no focus indicator at all: ${JSON.stringify(ring)}`,
    ).toBe(true);
  }
});
