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

  // REAL Tab presses, not `control.focus()`. `:focus-visible` is a modality
  // heuristic: after a programmatic focus with no keyboard interaction behind
  // it, a button does NOT match, while a text input does — so the old version
  // reported "control 2 shows no focus indicator at all" for a form where
  // every control is in fact ringed. It was measuring the heuristic, not the
  // stylesheet. SPECS.md §23.7 records this trap and it caught this suite.
  //
  // Tab also walks the real focus order, which is the thing a keyboard user
  // actually experiences, and skips anything not reachable that way.
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const control = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Next's dev-tools overlay is injected by `next dev` and does not exist
      // in a production build. It is not part of the app's focus order.
      if (el.tagName.includes("-")) return null;
      const s = getComputedStyle(el);
      return {
        id: el.tagName + "." + (String(el.className).trim().split(/\s+/)[0] || "-"),
        hasOutline: s.outlineStyle !== "none" && (parseFloat(s.outlineWidth) || 0) > 0,
        hasShadowRing: s.boxShadow !== "none" && s.boxShadow !== "",
        ring: { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, boxShadow: s.boxShadow.slice(0, 60) },
      };
    });
    if (!control) continue;
    seen.push(control.id);
    // Tab reaches only what a keyboard user can reach, which is the point:
    // the old version focused `button:visible` by index and hit the SUBMIT
    // button, which is `disabled` until the captcha verifies in production.
    // A disabled button cannot take focus, so .focus() was a no-op and the
    // assertion measured an unfocused element — reported as "control 2 shows
    // no focus indicator at all". Correct behaviour, read as a failure.
    // Accepts either mechanism. The invariant is "focus is visible at all",
    // which is the accessibility failure; WHICH mechanism draws it is a
    // design-standards question. In dark that is §23.7's two inset bands
    // behind a deliberately transparent outline, so the outline alone would
    // read as absent.
    expect(
      control.hasOutline || control.hasShadowRing,
      `${control.id} on /login shows no focus indicator at all: ${JSON.stringify(control.ring)}`,
    ).toBe(true);
  }
  expect(seen.length, `no focusable controls reached by Tab on /login`).toBeGreaterThan(0);
});
