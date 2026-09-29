import { test, expect } from "@playwright/test";
import { NIGHT_FROM_HOUR } from "@/lib/dubai-phase";

// Day mode: the Dubai clock picks the ground, the nav toggle overrides it,
// and the override survives a reload (the server reads the cookie, so no
// flash) and ThemeSync's 60s re-check. Then toggled back: the world is back.
//
// Faked to 10:00 Dubai, when the clock says day. The server reads the real
// clock, so the default-ground check only asserts it when the real Dubai hour
// agrees; the toggle round trip holds at any hour.
const DAYTIME_IN_DUBAI = new Date("2026-09-07T06:00:00.000Z"); // 10:00 Dubai

test("the toggle switches day and night, and the choice sticks", async ({ page }) => {
  expect(10).toBeLessThan(NIGHT_FROM_HOUR);
  await page.clock.install({ time: DAYTIME_IN_DUBAI });
  await page.goto("/");
  const root = page.locator("html");
  const start = (await root.getAttribute("data-theme")) as "day" | "night";
  const other = start === "day" ? "night" : "day";

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
