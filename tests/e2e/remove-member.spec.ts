import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// 080: the host removes a member for good. The removed account is told so,
// and opening the link again doesn't let it back in.

const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);

test("a removed member is told why and can't rejoin by the link", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint accounts");
  const [hostContext, memberContext] = [await browser.newContext(), await browser.newContext()];
  try {
    const stamp = Date.now();
    const host = await signInAsMember(hostContext, baseURL!, `Hind ${stamp}`);
    const member = await signInAsMember(memberContext, baseURL!, `Rami ${stamp}`);
    await withPlan({ title: `E2E remove ${stamp}`, spotIds, createdBy: host.userId }, async (planId) => {
      await localAdmin().from("plan_access").insert({ plan_id: planId, user_id: host.userId });
      const memberPage = await memberContext.newPage();
      await memberPage.goto(`/plan/${planId}`); // joins by the link
      const choice = memberPage.locator(".vote-options-grid .vote-option__choice").first();
      await choice.click({ timeout: 20_000 });
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      // Stored before the host looks, so the seat is on the host's first render.
      await expect.poll(async () => (await localAdmin().from("votes").select("id").eq("plan_id", planId).eq("user_id", member.userId)).data?.length,
        { timeout: 15_000 }).toBe(1);

      const hostPage = await hostContext.newPage();
      await hostPage.goto(`/plan/${planId}`);
      await hostPage.getByRole("button", { name: `Remove ${member.name} from this plan` }).click({ timeout: 20_000 });
      await hostPage.getByRole("button", { name: `Remove ${member.name} for good` }).click();

      const admin = localAdmin();
      await expect.poll(async () => (await admin.from("plan_access").select("user_id").eq("plan_id", planId).eq("user_id", member.userId)).data?.length,
        { timeout: 15_000 }).toBe(0);

      await memberPage.goto(`/plan/${planId}`);
      await expect(memberPage.getByText(/The host removed you from this plan/)).toBeVisible({ timeout: 20_000 });
      // The link again: still out, and no membership came back.
      await memberPage.reload();
      await expect(memberPage.getByText(/The host removed you from this plan/)).toBeVisible({ timeout: 20_000 });
      const { data } = await admin.from("plan_access").select("user_id").eq("plan_id", planId).eq("user_id", member.userId);
      expect(data).toEqual([]);
    });
  } finally {
    await Promise.all([hostContext.close(), memberContext.close()]);
  }
});
