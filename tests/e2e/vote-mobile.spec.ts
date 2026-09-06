import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The vote screen, on a phone.
//
// layout-consistency.spec.ts deliberately covers public pages only, because it
// runs unauthenticated and the vote screen needs a plan. That left the
// product's most important mobile surface untested as one: a plan is made on
// somebody's laptop and its share link is opened on everyone else's phone, so
// the guest path is *mostly* a mobile path.
//
// It also left a real bug uncaught. The round buttons — the only round
// navigation on that screen, and the control that actually moves a guest
// through the flow — measured 40x33.6 at 390px, under the floor in BOTH
// dimensions. Found by hand during the QA pass; these assertions are what stop
// it coming back.
//
// No viewport override anywhere in this file, on purpose: each project brings
// its own, so the same assertions run on a real iPhone 14 / Pixel 7 profile and
// on the desktop engines. The phone-only assertions gate on the viewport width
// instead, because globals.css scopes the touch floor to <=640px — a desktop
// cursor is precise and its density is deliberate.
//
// ⚠ Mobile Safari cannot run this locally against a production build: HSTS plus
// the CSP's `upgrade-insecure-requests` make WebKit rewrite localhost assets to
// https and fail with an SSL error. That is correct production behaviour, and
// the headers must not be relaxed to make a test pass — run WebKit against an
// https preview via PLAYWRIGHT_BASE_URL. See playwright.config.ts.

const PLAN_ID: string = (() => {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), "tests/e2e/.fixture.local.json"), "utf8"),
    ).planId ?? "";
  } catch {
    return "";
  }
})();

/** The touch floor globals.css enforces, in px. */
const TOUCH_FLOOR = 44;
/** globals.css scopes that floor to this width and below. */
const TOUCH_FLOOR_MAX_WIDTH = 640;

/**
 * Open the plan and get past the NameGate.
 *
 * Reads the plan but casts no vote — everything here is layout, and a spec
 * that votes would be duplicating guest-vote.spec.ts while making its exact
 * 0 -> 1 voter assertion flaky.
 *
 * `.waitFor()` rather than `.isVisible()` for the same reason guest-vote
 * documents: the gate appears only after anon sign-in, claim_plan_access and
 * the plan/spots fetch, and a single DOM check races all three.
 */
async function openVoteScreen(page: Page): Promise<void> {
  await page.goto(`/plan/${PLAN_ID}`);
  const nameInput = page.getByPlaceholder("Your name");
  const gateShown = await nameInput
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (gateShown) {
    await nameInput.fill(`Layout ${Date.now()}`);
    await page.getByRole("button", { name: "Start voting" }).click();
  }
  await expect(page.getByText(/\d+ (?:person|people) voting/)).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("the vote screen", () => {
  test.skip(
    !PLAN_ID,
    "no local fixture — global-setup.ts provisions one against a local Supabase stack; see tests/README.md",
  );

  test("has no horizontal overflow", async ({ page }) => {
    await openVoteScreen(page);
    // The option cards arrive with the plan, and the row is a scroller whose
    // width settles once they do. Waiting for a card before measuring, and
    // polling rather than sampling once, because the first version of this
    // test asserted immediately and reported a 6px overhang on Pixel 7 that
    // was gone milliseconds later — a flaky test that looks like a real bug
    // is worse than no test.
    await page.locator(".vote-options-grid button.token").first().waitFor({ timeout: 15_000 });

    const measure = () => page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const offenders: { sel: string; overhang: number }[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        // The option row is a deliberate horizontal scroller — wide content
        // scrolling inside its own container is the mandated pattern, and is
        // exactly how the vote screen shows three cards on a phone. What must
        // never happen is the BODY scrolling sideways.
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
          const cls = typeof el.className === "string"
            ? el.className.trim().split(/\s+/).slice(0, 3).join(".")
            : "";
          offenders.push({
            sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ""),
            overhang: Math.round(overhang),
          });
        }
      }
      return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 8) };
    });

    await expect
      .poll(async () => (await measure()).offenders, {
        timeout: 10_000,
        message: "elements crossing the viewport edge",
      })
      .toEqual([]);

    // The document itself must never scroll sideways. Wide content scrolling
    // inside its own container is the mandated pattern and is checked above by
    // exemption; this is the assertion that the exemption was not abused.
    const settled = await measure();
    expect(settled.scrollWidth).toBeLessThanOrEqual(settled.vw + 1);
  });

  test("every control on it clears the 44px touch floor", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 0;
    test.skip(
      width === 0 || width > TOUCH_FLOOR_MAX_WIDTH,
      `touch floor is scoped to <=${TOUCH_FLOOR_MAX_WIDTH}px; this project is ${width}px`,
    );

    await openVoteScreen(page);
    await page.locator(".vote-options-grid button.token").first().waitFor({ timeout: 15_000 });

    const measure = (floor: number) => page.evaluate((f) => {
      const out: { sel: string; w: number; h: number; text: string }[] = [];
      const selector = 'button, a, input, select, textarea, [role="button"]';
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
        // WCAG 2.5.8 exempts a link inside a sentence, and padding one out
        // would break the text it sits in.
        if (el.tagName === "A" && el.closest("p, li")) continue;
        // The target is what a thumb hits. A checkbox inside its own label is
        // hit through the label, so measure that instead of the box.
        const label = el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox"
          ? el.closest("label")
          : null;
        const box = (label ?? el).getBoundingClientRect();
        if (box.width + 0.5 < f || box.height + 0.5 < f) {
          const cls = typeof el.className === "string"
            ? el.className.trim().split(/\s+/).slice(0, 2).join(".")
            : "";
          out.push({
            sel: el.tagName.toLowerCase() + (cls ? `.${cls}` : ""),
            w: Math.round(box.width * 10) / 10,
            h: Math.round(box.height * 10) / 10,
            text: (el.textContent ?? "").trim().slice(0, 20),
          });
        }
      }
      return out;
    }, floor);

    await expect
      .poll(async () => measure(TOUCH_FLOOR), {
        timeout: 10_000,
        message: `controls under ${TOUCH_FLOOR}px`,
      })
      .toEqual([]);
  });

  test("keyboard focus draws the dark two-band ring", async ({ page }) => {
    await openVoteScreen(page);

    // A REAL key press. SPECS.md §23.7 records that a scripted `.focus()`
    // reports a false negative here — :focus-visible is a modality heuristic,
    // so driving it programmatically does not prove what a keyboard user sees.
    await page.keyboard.press("Tab");

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        theme: document.documentElement.dataset.theme,
        outlineColor: cs.outlineColor,
        insetBands: (cs.boxShadow.match(/inset/g) ?? []).length,
      };
    });

    expect(focused, "Tab moved focus to something").not.toBeNull();
    // Dark supersedes the graphite outline with two inset bands. The outline
    // stays present but transparent: forced-colors drops box-shadow entirely
    // and re-colours the outline, so it is the ring for the users most likely
    // to need it, and asserting it is transparent is asserting it is still there.
    expect(focused!.theme).toBe("night");
    expect(focused!.outlineColor).toBe("rgba(0, 0, 0, 0)");
    expect(focused!.insetBands).toBe(2);
  });
});
