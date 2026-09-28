import { test, expect, type Page } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// Luna's answer into the composer (use-composer applyIntent), with
// /api/smart-search answered in the browser: no model call, no quota. What
// is pinned is what the form does with an intent, including the honest note
// when the kind it picked can't be used. The server renders the box only
// when OPENAI_API_KEY is set; the E2E job sets a dummy one for that.

const intent = (overrides: Record<string, unknown>) => ({
  category: "padel", title: "Padel after work", summary: "Padel near the Marina, about AED 150 each",
  maxBudget: 150, origin: "marina", radiusKm: 10, vibeKeywords: ["casual"], avoidKeywords: [], occasion: null,
  ...overrides,
});

async function ask(page: Page, body: unknown, status = 200) {
  await page.route("**/api/smart-search", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
  const input = page.locator("#smart-search-input");
  await expect(input, "no Luna box: is OPENAI_API_KEY set for the server?").toBeVisible({ timeout: 20_000 });
  await input.fill("Padel after work near the Marina, not too pricey");
  await page.getByRole("button", { name: "Build it" }).click();
}

const kind = (page: Page, label: string) => page.locator("button.plan-category-option", { hasText: label });
const tuneSummary = (page: Page) => page.locator(".plan-tune > summary");

test.describe("Luna into the composer", () => {
  test.skip(!canProvision(), "needs the local stack to mint accounts");

  test("an intent sets the kind, the title and the budget", async ({ page, context, baseURL }) => {
    await signInAsMember(context, baseURL!, `Luna ${Date.now()}`);
    await page.goto("/home");
    await ask(page, { intent: intent({}) });
    await expect(page.getByText("Padel near the Marina, about AED 150 each")).toBeVisible();
    await expect(kind(page, "Padel")).toHaveAttribute("aria-pressed", "true");
    await expect(tuneSummary(page)).toContainText("“Padel after work”");
    await expect(page.getByText(/so this stays/)).toHaveCount(0);
  });

  test("a kind the member is too young for keeps the current kind and title, and says so", async ({ page, context, baseURL }) => {
    const member = await signInAsMember(context, baseURL!, `Luna young ${Date.now()}`);
    const nineteen = new Date(Date.now() - 19.5 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    const { error } = await localAdmin().from("member_ages").update({ date_of_birth: nineteen }).eq("user_id", member.userId);
    if (error) throw new Error(`setting the birthday failed: ${error.message}`);
    await page.goto("/home");
    await expect(kind(page, "Dinner")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
    await ask(page, { intent: intent({ category: "nightlife", title: "Big night out" }) });
    await expect(page.getByText("Nightlife is 21+, so this stays Dinner.")).toBeVisible();
    await expect(kind(page, "Dinner")).toHaveAttribute("aria-pressed", "true");
    await expect(tuneSummary(page)).not.toContainText("Big night out");
  });

  test("a kind the app doesn't list keeps the current kind, and says so", async ({ page, context, baseURL }) => {
    await signInAsMember(context, baseURL!, `Luna odd ${Date.now()}`);
    await page.goto("/home");
    await ask(page, { intent: intent({ category: "yachting", title: "On the water" }) });
    await expect(page.getByText("Luna suggested a kind of place the app doesn’t list, so this stays Dinner.")).toBeVisible();
    await expect(tuneSummary(page)).not.toContainText("On the water");
  });

  test("a session that ended offers the way back to sign in", async ({ page, context, baseURL }) => {
    await signInAsMember(context, baseURL!, `Luna late ${Date.now()}`);
    await page.goto("/home");
    await ask(page, { error: "Sign in to use smart search." }, 401);
    await expect(page.locator(".plan-smart-search__error")).toContainText("Sign in to use smart search.");
    // The navigation, not where it settles: this session is really still
    // valid (only the route said 401), so /login sends it straight back home.
    const toLogin = page.waitForRequest((request) => /\/login\?next=(%2F|\/)home/.test(request.url()));
    await page.getByRole("button", { name: "Sign in again" }).click();
    await toLogin;
  });

  test("a brief written before sign-in is back in the box after it", async ({ page, context, baseURL }) => {
    await signInAsMember(context, baseURL!, `Luna draft ${Date.now()}`);
    const brief = "A quiet terrace near Jumeirah, about AED 250 each";
    await context.addInitScript((query) => sessionStorage.setItem("deal-three:plan-draft", JSON.stringify({
      category: "dinner", title: "Where should we eat?", origin: "anywhere", maxBudget: null, radiusKm: null, smartQuery: query,
    })), brief);
    await page.goto("/home");
    await expect(page.locator("#smart-search-input")).toHaveValue(brief, { timeout: 20_000 });
  });
});
