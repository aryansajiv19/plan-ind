import { test, expect } from "@playwright/test";
import { NIGHT_FROM_HOUR, THEME_KEY } from "@/lib/dubai-phase";

// SPECS.md §23.8 — light is parked, dark is the identity, and the ground is
// pinned in TWO places: app/layout.tsx stamps the first paint, ThemeSync
// re-resolves on mount, on a `storage` event, and every 60 seconds.
//
// The interval is the one that bites. Pin only the server stamp and the app
// looks completely correct, then flips to light up to a minute later — in
// front of whoever is using it. §19.2 shipped exactly that bug in the other
// direction and it was caught in implementation rather than by a test, which
// is the gap this file closes.
//
// Two properties make it worth a spec of its own rather than an assertion
// bolted onto another one. It is time-delayed, so nothing that samples the
// page once can see it. And it is invisible to visual.spec.ts, because a
// screenshot taken before the interval fires shows the correct palette.
//
// The clock is faked to a DAYTIME Dubai hour on purpose. Asserting "it is
// still night" at an hour that is already night proves nothing — the Dubai
// clock would say night anyway. At 10:00 Dubai the unparked app resolves
// `day`, so this only passes while the park is genuinely holding.

// 06:00 UTC is 10:00 in Dubai, comfortably before NIGHT_FROM_HOUR. Asserted
// rather than trusted, so this file fails loudly if the boundary ever moves
// past 10:00 and quietly stops testing what it claims to.
const DAYTIME_IN_DUBAI = new Date("2026-09-07T06:00:00.000Z");
const DAYTIME_DUBAI_HOUR = 10;

test("the ground stays dark across ThemeSync's 60s re-resolve", async ({ page }) => {
  // Must be installed before navigation: ThemeSync captures its interval on
  // mount, and a clock swapped in afterwards would not own that timer.
  expect(
    DAYTIME_DUBAI_HOUR,
    "this test only means anything at an hour the clock would call day",
  ).toBeLessThan(NIGHT_FROM_HOUR);

  await page.clock.install({ time: DAYTIME_IN_DUBAI });
  await page.goto("/");

  const root = page.locator("html");

  // First paint — the server stamp (app/layout.tsx).
  await expect(root).toHaveAttribute("data-theme", "night");

  // After hydration — ThemeSync's mount pass. A server stamp that is right and
  // a client that immediately disagrees is the same bug arriving sooner.
  await expect(root).toHaveAttribute("data-theme", "night");

  // Past the interval. Fake time rather than a real 61-second wait: this has
  // to run in CI on every project, and the thing under test is the timer
  // firing, not the wall clock reaching a number.
  await page.clock.fastForward(61_000); // ms — the clock API takes a number or "mm:ss", not "61s"
  await expect(root).toHaveAttribute("data-theme", "night");

  // And well past it, in case a future change resolves the ground on a
  // different cadence than the one this file assumes.
  await page.clock.fastForward(5 * 60_000);
  await expect(root).toHaveAttribute("data-theme", "night");
});

test("a stored light preference does not unpark light", async ({ page }) => {
  // ThemeSync also re-resolves on a `storage` event, reading a preference out
  // of localStorage. The park has to survive that path too — otherwise anyone
  // carrying a preference from before the park, or a second tab writing one,
  // gets light back on a screen the rest of the app renders dark.
  await page.goto("/");
  // Wait for hydration before dispatching. Without this the event fires
  // before ThemeSync has attached its listener, nothing handles it, and the
  // test passes because the park was never exercised — verified by mutation:
  // with the client pin removed this assertion still passed until the wait
  // was added. A test that survives the bug it was written for is worse than
  // no test.
  await expect(page.locator("main.home-experience--ready")).toBeVisible({ timeout: 15_000 });

  await page.evaluate((key) => {
    try {
      window.localStorage.setItem(key, "day");
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "day" }));
    } catch {
      // Storage can throw outright in a locked-down browser; the park still
      // has to hold, which is what the assertion below checks either way.
    }
  }, THEME_KEY);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
});
