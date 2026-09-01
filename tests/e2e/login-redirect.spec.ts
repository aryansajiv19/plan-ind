import { test, expect } from "@playwright/test";

// FE.10: /login threads a `next` param through sign-in so a guest who hits
// "Sign in" from the vote page's guest-paused screen returns to their plan
// instead of landing on /home.
//
// This does NOT drive a full OTP or Google OAuth round trip — the email step
// needs a real inbox, and both sign-in paths require a Turnstile token in a
// production build (this spec's webServer runs `next build && next start`,
// i.e. NODE_ENV=production), neither of which is automatable here. What's
// covered instead is the part FE.10 actually changed: the `next` value is
// captured from the query string, validated, and carried as a hidden field
// into every sign-in form (see components/AuthForm.tsx, lib/auth.ts's
// safeNextPath). The full authenticated round trip was verified by hand
// (see the AGENT_COORDINATION.md Review entry for 2026-09-02).

const PLAN_PATH = "/plan/22222222-2222-2222-2222-222222222222";

test("a valid next param is carried as a hidden field into both sign-in forms", async ({ page }) => {
  await page.goto(`/login?next=${encodeURIComponent(PLAN_PATH)}`);

  const googleForm = page.locator("form", { has: page.getByRole("button", { name: "Continue with Google" }) });
  await expect(googleForm.locator('input[name="next"]')).toHaveValue(PLAN_PATH);

  const emailForm = page.locator("#email-auth");
  await expect(emailForm.locator('input[name="next"]')).toHaveValue(PLAN_PATH);
});

test("an unsafe next param falls back to /home rather than the raw value", async ({ page }) => {
  await page.goto("/login?next=https://evil.example.com");

  const emailForm = page.locator("#email-auth");
  await expect(emailForm.locator('input[name="next"]')).toHaveValue("/home");
});

test("no next param still defaults every form to /home", async ({ page }) => {
  await page.goto("/login");

  const emailForm = page.locator("#email-auth");
  await expect(emailForm.locator('input[name="next"]')).toHaveValue("/home");
});
