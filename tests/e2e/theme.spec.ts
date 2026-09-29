import { test, expect } from "@playwright/test";
import { NIGHT_FROM_HOUR } from "@/lib/dubai-phase";

// Day mode: the Dubai clock picks the ground, the nav toggle overrides it,
// and the override survives a reload (the server reads the cookie, so no
// flash) and ThemeSync's 60s re-check. Then toggled back: the world is back.
//
// The browser clock is the real one (installed only so the 60s re-check can be
// fast-forwarded): a faked daytime clock disagreed with the server's real one
// after 17:00 Dubai, and the page flipped under the test (CI 2026-09-29).
// The starting ground is read from the toggle once hydrated, so the round
// trip holds at any hour.

test("the toggle switches day and night, and the choice sticks", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  const root = page.locator("html");
  const toggle = page.getByRole("button", { name: /^Switch to (day|night) mode$/ }).first();
  await expect(toggle).toBeVisible();
  const other = (await toggle.getAttribute("aria-label"))!.includes("day") ? "day" : "night";
  const start = other === "day" ? "night" : "day";
  await expect(root).toHaveAttribute("data-theme", start);

  await page.getByRole("button", { name: `Switch to ${other} mode` }).first().click();
  await expect(root).toHaveAttribute("data-theme", other);

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", other);
  await page.clock.fastForward(61_000); // past ThemeSync's re-check
  await expect(root).toHaveAttribute("data-theme", other);

  await page.getByRole("button", { name: `Switch to ${start} mode` }).first().click();
  await expect(root).toHaveAttribute("data-theme", start);
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", start);
});

test("with no choice, the ground follows the Dubai clock", async ({ page }) => {
  await page.goto("/");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  const expected = hour >= NIGHT_FROM_HOUR || hour < 6 ? "night" : "day";
  await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
});
