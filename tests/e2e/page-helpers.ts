import type { Page } from "@playwright/test";

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
