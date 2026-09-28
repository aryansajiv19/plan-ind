import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// Discover's Map: every place with a location becomes a star. The seed has
// no coordinates, so the member gets a private place of their own that does
// (a live read, not the cached catalogue), which makes this deterministic.

test("Discover's map toggle draws the member's located places as stars", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const stamp = Date.now();
  const member = await signInAsMember(context, baseURL!, `Leen ${stamp}`);
  const admin = localAdmin();
  const spotId = randomUUID();
  const name = `E2E star ${stamp}`;
  const { error } = await admin.from("spots").insert({
    id: spotId, name, category: "cafe", area: "Jumeirah", cuisine: "Coffee", price_band: "$$", min_spend: 0,
    open_till: "10pm", vibe: "E2E fixture spot", source: "custom", visibility: "private", created_by_user_id: member.userId,
    latitude: 25.2048, longitude: 55.2708,
  });
  if (error) throw new Error(`creating the place failed: ${error.message}`);
  try {
    await page.goto("/home?view=discover");
    await page.getByRole("button", { name: "Map", exact: true }).click({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveAttribute("aria-pressed", "true");
    const sky = page.getByRole("img", { name: /places on a map of Dubai$/ });
    await expect(sky).toBeVisible();
    expect(await sky.locator("circle.explore-sky__dot").count()).toBeGreaterThan(0);
    await expect(sky.locator("text", { hasText: name })).toHaveCount(1);
  } finally {
    await admin.from("spots").delete().eq("id", spotId);
  }
});
