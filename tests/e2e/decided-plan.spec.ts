import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// The decided plan's newer pieces, as a member of a real decided plan:
// the at-a-glance panel, Who's in above When, Share to story's card, and
// "Plan another like this" carrying the plan into a fresh composer.

const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();

test("a decided plan shows at a glance, Who's in above When, a story card, and plans another like it", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  test.setTimeout(90_000); // five steps, each a full page on a dev server
  const stamp = Date.now();
  const member = await signInAsMember(context, baseURL!, `Dana ${stamp}`);
  const title = `E2E decided ${stamp}`;
  await withPlan({ title, spotIds, status: "decided", winnerSpotId: SEEDED.threeFils, eventTime: inThreeDays, createdBy: member.userId }, async (planId) => {
    await localAdmin().from("plan_access").insert({ plan_id: planId, user_id: member.userId });
    await page.goto(`/plan/${planId}`);

    const glance = page.locator("section.tonight-panel");
    await expect(glance).toBeVisible({ timeout: 20_000 });
    await expect(glance.getByRole("heading", { level: 2 })).toHaveText(/at a glance$/);
    expect(await glance.locator(".tonight-panel__row").count()).toBeGreaterThan(0);

    const whosIn = page.getByText("Who’s in", { exact: true });
    const when = page.getByText("When", { exact: true });
    await expect(whosIn).toBeVisible();
    // DOM order, not pixels: Node.DOCUMENT_POSITION_FOLLOWING is 4.
    const order = await whosIn.evaluate((a, b) => a.compareDocumentPosition(b as Node), await when.elementHandle());
    expect(order & 4, "Who's in should come before When").toBe(4);

    // Share to story: the card is a PNG this member may fetch, and the button hands it over.
    const card = await page.request.get(`/plan/${planId}/story`);
    expect(card.status()).toBe(200);
    expect(card.headers()["content-type"]).toContain("image/png");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Share to story" }).click();
    expect((await download).suggestedFilename()).toBe("planind-plan.png");

    await page.getByRole("button", { name: "Plan another like this" }).click();
    await expect(page).toHaveURL(/\/home$/, { timeout: 20_000 });
    await expect(page.locator(".plan-tune > summary")).toContainText(`“${title} again”`, { timeout: 20_000 });
  });
});
