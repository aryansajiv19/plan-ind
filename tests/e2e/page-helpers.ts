import { expect, type Page } from "@playwright/test";

/**
 * Resolves once Realtime says row changes will flow ("Subscribed to
 * PostgreSQL"). The page's SUBSCRIBED status comes earlier, on the join
 * reply; a change in between is not delivered, so acting before this raced
 * the other screen (a CI flake). Attach before navigating.
 */
export function realtimeReady(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => {
      if (String(payload).includes("Subscribed to PostgreSQL")) resolve();
    }));
  });
}

/** The decided plan's booking block. */
export const bookingSection = (page: Page) =>
  page.locator("div.border-t", { has: page.getByText("Booking", { exact: true }) }).first();

/**
 * The public landing (/ and /demo) mounts its composer (#plan-lab) and wall
 * (#right-now) only as they near the viewport (NearViewport). Scroll there
 * like a visitor, then wait until no placeholder or skeleton is left.
 */
export async function mountLandingSection(page: Page, id: "plan-lab" | "right-now") {
  const section = page.locator(`#${id}`);
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 20_000 });
}
