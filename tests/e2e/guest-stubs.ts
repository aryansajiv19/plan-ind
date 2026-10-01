import type { Page } from "@playwright/test";

// Shared by guest-join.spec.ts and ui-bugs.spec.ts: the guest join card in a
// PRODUCTION build needs a Turnstile site key (the join button stays closed
// until a token arrives), and the token reaches the page through Cloudflare's
// script. CI therefore builds a second time with Cloudflare's public
// always-pass TEST key (see .github/workflows/ci.yml) and these specs answer
// the script request with a stub that "solves" at once, so no network is
// needed. Without the key in the build the specs skip with a reason.
export const HAS_TURNSTILE_KEY = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
export const NO_KEY_REASON =
  "needs a build with NEXT_PUBLIC_TURNSTILE_SITE_KEY set (CI's second e2e step sets Cloudflare's always-pass test key); "
  + "a keyless production build correctly refuses guest joins";

export async function stubTurnstile(page: Page): Promise<void> {
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, options) {
          const frame = document.createElement("iframe");
          frame.title = "stub";
          frame.style.cssText = "width:100%;height:65px;border:0"; // the managed widget's height
          el.appendChild(frame);
          setTimeout(() => options.callback("e2e-token"), 50);
          return "stub-widget";
        },
        remove() {},
      };`,
    }));
}

/** What /api/guest/join answers for each refusal (lib/guest.ts REFUSALS and friends). */
export const REFUSALS = [
  { label: "full", status: 409, error: "This plan has reached its guest limit. Sign in to join.", needsAccount: true },
  { label: "age limit", status: 403, error: "This plan has places with an age limit. Sign in to join.", needsAccount: true },
  { label: "removed", status: 403, error: "The host removed you from this plan.", needsAccount: false },
  { label: "expired", status: 409, error: "Your guest pass has expired. Sign in to keep voting.", needsAccount: true },
  { label: "rate limited", status: 429, error: "Too many guests from this connection. Try again in a few minutes.", needsAccount: false },
  { label: "plan gone", status: 404, error: "That plan link does not work.", needsAccount: false },
  { label: "security check", status: 400, error: "The security check failed. Try again.", needsAccount: false },
] as const;

/** Answer the join route with a refusal instead of calling the server. */
export async function stubJoin(page: Page, refusal: (typeof REFUSALS)[number]): Promise<void> {
  await page.route("**/api/guest/join", (route) =>
    route.fulfill({
      status: refusal.status,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: refusal.error, ...(refusal.needsAccount ? { needsAccount: true } : {}) }),
    }));
}

/** Type a name into the join card and submit it. */
export async function submitJoin(page: Page, name: string): Promise<void> {
  await page.getByLabel("Your first name").fill(name);
  await page.getByRole("button", { name: "Join and vote" }).click();
}
