import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { planIdFor, planTitleFor, NO_FIXTURE_REASON } from "./fixture";
import { localStackUrl, signInAsMember } from "./local-stack";

// A shared plan link for a visitor with no member session (guest voting,
// migration 099, docs/GUEST_VOTE.md; it replaced the 2026-09-25 sign-in wall).
//
// proxy.ts no longer redirects /plan/<uuid>: the page itself shows the guest
// join card, and the database still refuses every read and write without a
// member or guest session. Link crawlers still read the PLAN's title. Each
// "open" claim is paired with a positive control in the same run, and the
// og:title assertion needs the local fixture: an unknown plan renders the
// generic card with a 200.
const PLAN_ID = planIdFor("sign-in-gate");
const PLAN_TITLE = planTitleFor("sign-in-gate");
const PLAN_PATH = `/plan/${PLAN_ID}`;

// Real WhatsApp link-preview UA shape; Next's isBot matches /WhatsApp/i.
const CRAWLER_UA = "WhatsApp/2.24.6.77 A";
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test.describe("a shared plan link without a member session", () => {
  test.skip(!PLAN_ID || !PLAN_TITLE, NO_FIXTURE_REASON);

  test("a signed-out browser stays on the plan and is offered the join card", async ({ page }) => {
    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL((url) => url.pathname === PLAN_PATH);
    await expect(page.getByLabel("Your first name")).toBeVisible({ timeout: 20_000 });
    // The account door keeps `next`, so signing in returns to this plan.
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }))
      .toHaveAttribute("href", `/login?next=${encodeURIComponent(PLAN_PATH)}`);
  });

  test("positive control: a signed-in account on the same link gets the plan, not the card", async ({ page, context, baseURL }) => {
    const me = await signInAsMember(context, baseURL!, `Gate ${Date.now()}`);
    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL((url) => url.pathname === PLAN_PATH);
    await expect(page.getByText(`Hey ${me.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Your first name")).toHaveCount(0);
  });

  test("an anonymous session with no guest pass is kept, and offered the join card", async ({ page, context, baseURL }) => {
    // A leftover anonymous session (no guest_sessions row) reads nothing: the
    // database refuses it. It is no longer ended on the plan link (only /login
    // and /invite end it), and it joins with a name like anyone else.
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

    await expect(page).toHaveURL((u) => u.pathname === PLAN_PATH);
    await expect(page.getByLabel("Your first name")).toBeVisible({ timeout: 20_000 });
    expect((await context.cookies()).some((c) => authCookie(c.name) && c.value !== "")).toBe(true);
  });

  test("a link crawler reads the plan's og:title, and a browser gets the page too", async ({ request }) => {
    const crawler = await request.get(PLAN_PATH, { headers: { "user-agent": CRAWLER_UA }, maxRedirects: 0 });
    expect(crawler.status()).toBe(200);
    const ogTitle = (await crawler.text()).match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/)?.[1];
    expect(ogTitle, "og:title in the crawler's HTML").toBe(PLAN_TITLE);

    // Pair: a phone browser is no longer redirected, and its HTML carries the
    // same plan title (the join card's server-rendered preview).
    const browser = await request.get(PLAN_PATH, { headers: { "user-agent": BROWSER_UA }, maxRedirects: 0 });
    expect(browser.status()).toBe(200);
    expect(await browser.text()).toContain(PLAN_TITLE);
  });
});
