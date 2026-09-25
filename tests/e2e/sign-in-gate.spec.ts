import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { planIdFor, planTitleFor, NO_FIXTURE_REASON } from "./fixture";
import { localStackUrl, signInAsMember } from "./local-stack";

// The sign-in gate on a shared plan link (owner decision 2026-09-25).
//
// proxy.ts answers /plan/<uuid> before render: a visitor without a permanent
// account session gets a redirect to /login?next=/plan/<uuid>, so sign-in
// brings them back to the plan they were sent. Link crawlers are let through
// so WhatsApp still unfurls the PLAN's title, not the login page's. Both
// halves break silently -- a lost `next` just lands people on /home, a gated
// crawler just shows a generic card -- so each refusal here is paired with
// its positive control in the same run.
//
// Needs the local fixture: the og:title assertion is only meaningful against
// a plan whose exact title this run chose (global-setup), since an unknown
// plan still renders the generic card with a 200.
const PLAN_ID = planIdFor("sign-in-gate");
const PLAN_TITLE = planTitleFor("sign-in-gate");
const PLAN_PATH = `/plan/${PLAN_ID}`;

// Real WhatsApp link-preview UA shape; Next's isBot matches /WhatsApp/i.
const CRAWLER_UA = "WhatsApp/2.24.6.77 A";
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test.describe("sign-in gate on a shared plan link", () => {
  test.skip(!PLAN_ID || !PLAN_TITLE, NO_FIXTURE_REASON);

  test("a signed-out browser lands on /login with the plan preserved as next", async ({ page }) => {
    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL((url) =>
      url.pathname === "/login" && url.searchParams.get("next") === PLAN_PATH);
    // `next` must survive into the forms that actually sign in, or the round
    // trip ends on /home (login-redirect.spec.ts covers the validation).
    await expect(page.locator('#email-auth input[name="next"]')).toHaveValue(PLAN_PATH);
  });

  test("positive control: a signed-in account on the same link stays on the plan", async ({ page, context, baseURL }) => {
    const me = await signInAsMember(context, baseURL!, `Gate ${Date.now()}`);
    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL((url) => url.pathname === PLAN_PATH);
    await expect(page.getByText(`Hey ${me.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test("an anonymous session is treated as signed out, and ended", async ({ page, context, baseURL }) => {
    // The live project still has anonymous sign-ins switched on, so a guest
    // session minted before the decision can still arrive. It must be
    // redirected like no session at all, not let through to a page whose
    // every read and write migration 064 now refuses.
    const url = localStackUrl();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    test.skip(!key, "needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY) for the local stack");
    const { data, error } = await createClient(url, key!, { auth: { persistSession: false } }).auth.signInAnonymously();
    test.skip(!!error, `local stack refused anonymous sign-in (${error?.message}); enable_anonymous_sign_ins is off`);

    const jar = new Map<string, string>();
    await createServerClient(url, key!, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (toSet) => { for (const c of toSet) jar.set(c.name, c.value); },
      },
    }).auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: baseURL!, sameSite: "Lax" as const })));
    const authCookie = (name: string) => /^sb-.*-auth-token/.test(name);
    expect((await context.cookies()).some((c) => authCookie(c.name)), "anonymous session injected").toBe(true);

    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL((u) => u.pathname === "/login" && u.searchParams.get("next") === PLAN_PATH);
    // proxy.ts signs the guest session out on the way, so sign-in starts a
    // fresh account instead of grafting onto the throwaway anonymous uid.
    expect((await context.cookies()).filter((c) => authCookie(c.name) && c.value !== "")).toEqual([]);
  });

  test("a link crawler still reads the plan's og:title, and a browser UA does not", async ({ request }) => {
    const crawler = await request.get(PLAN_PATH, { headers: { "user-agent": CRAWLER_UA }, maxRedirects: 0 });
    expect(crawler.status()).toBe(200);
    const ogTitle = (await crawler.text()).match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)?.[1];
    expect(ogTitle, "og:title in the crawler's HTML").toBe(PLAN_TITLE);

    // Pair: the same request as a phone browser is gated. Without this, a
    // proxy that stopped gating anyone would pass the assertion above.
    const browser = await request.get(PLAN_PATH, { headers: { "user-agent": BROWSER_UA }, maxRedirects: 0 });
    expect(browser.status()).toBe(307);
    const location = new URL(browser.headers()["location"] ?? "", "http://x");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(PLAN_PATH);
  });
});
