import { test, expect, type Page } from "@playwright/test";
import { signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// A failed auth read is not a verdict (the silent-failure class). When the
// browser's GET /auth/v1/user fails for a moment, a signed-in member must
// still end on the plan, and must never be shown "Sign in to join this plan"
// or "Add a name to your profile" on the way. Only the browser's calls are
// failed; the server's own session check (proxy.ts, SSR) is untouched. The
// controls keep the refusal honest: no session at all still goes to sign in,
// and an auth server that says 401 is still believed.

const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
const WRONG = ["Sign in to join this plan", "Add a name to your profile"];

/** Records, from the first paint on, whether either wrong screen ever rendered. */
async function watchForWrongScreens(page: Page) {
  await page.addInitScript((texts) => {
    const w = window as unknown as { __wrongScreens: string[] };
    w.__wrongScreens = [];
    new MutationObserver(() => {
      const body = document.body?.innerText ?? "";
      for (const text of texts) if (body.includes(text) && !w.__wrongScreens.includes(text)) w.__wrongScreens.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, WRONG);
  return () => page.evaluate(() => (window as unknown as { __wrongScreens: string[] }).__wrongScreens);
}

/** Answers the browser's GET /auth/v1/user with `status` for the first `times` calls, then lets them through. */
async function failUserReads(page: Page, status: number, times: number) {
  let failed = 0;
  await page.route("**/auth/v1/user", async (route) => {
    if (route.request().method() !== "GET" || failed >= times) return route.fallback();
    failed += 1;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ code: status, msg: "e2e: auth read failed" }) });
  });
  return () => failed;
}

test.describe("a failed auth read on the plan page", () => {
  test.skip(!canProvision(), "needs the local stack to mint an account");

  // A plan load makes three browser reads of /auth/v1/user (claim, voter
  // name, last mile). One failure can land on a caller that shrugs it off, so
  // two is the smallest that reached a wrong screen on main, and three fails
  // every read the page makes on mount: only a retry gets past it.
  for (const times of [2, 3]) {
    test(`a signed-in member ends on the plan when /auth/v1/user fails ${times}× with 503`, async ({ page, context, baseURL }) => {
      const stamp = Date.now();
      await signInAsMember(context, baseURL!, `Noor ${stamp}`);
      const title = `E2E auth blip ${stamp}`;
      await withPlan({ title, spotIds }, async (planId) => {
        const wrongScreens = await watchForWrongScreens(page);
        const failures = await failUserReads(page, 503, times);
        await page.goto(`/plan/${planId}`); // joins by the link: claim_plan_access runs after the auth read
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(".vote-options-grid .vote-option__choice").first()).toBeVisible();
        expect(failures(), "the route never failed a read, so this proved nothing").toBe(times);
        expect(await wrongScreens()).toEqual([]);
      });
    });
  }

  test("control: with no session at all, the plan link still asks to sign in", async ({ page }) => {
    await withPlan({ title: `E2E auth signed out ${Date.now()}`, spotIds }, async (planId) => {
      await page.goto(`/plan/${planId}`);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fplan%2F${planId}`));
      await expect(page.locator("#email")).toBeVisible();
    });
  });

  test("control: when the auth server says 401, the page believes it and offers sign in", async ({ page, context, baseURL }) => {
    const stamp = Date.now();
    await signInAsMember(context, baseURL!, `Noor ${stamp}`);
    await withPlan({ title: `E2E auth refused ${stamp}`, spotIds }, async (planId) => {
      const failures = await failUserReads(page, 401, Number.POSITIVE_INFINITY);
      await page.goto(`/plan/${planId}`);
      await expect(page.getByText("Sign in to join this plan")).toBeVisible({ timeout: 30_000 });
      expect(failures()).toBeGreaterThan(0);
    });
  });
});
