import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// The Plan tab's rail: a decided plan names where the group is going; an
// open plan this member hasn't voted in asks for their vote.

const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);

test("the home rail shows the winner on a decided plan and asks for a vote on an open one", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const stamp = Date.now();
  const member = await signInAsMember(context, baseURL!, `Yara ${stamp}`);
  const admin = localAdmin();
  await withPlan({ title: `E2E rail decided ${stamp}`, spotIds, status: "decided", winnerSpotId: SEEDED.threeFils, createdBy: member.userId }, async (decidedId) => {
    await withPlan({ title: `E2E rail open ${stamp}`, spotIds, createdBy: member.userId }, async (openId) => {
      await admin.from("plan_access").insert([{ plan_id: decidedId, user_id: member.userId }, { plan_id: openId, user_id: member.userId }]);
      await page.goto("/home");
      const card = (title: string) => page.locator(".your-plans__card", { hasText: title });
      await expect(card(`E2E rail decided ${stamp}`)).toContainText("3Fils · Jumeirah", { timeout: 20_000 });
      await expect(card(`E2E rail decided ${stamp}`)).not.toContainText("Your vote needed");
      await expect(card(`E2E rail open ${stamp}`)).toContainText("Your vote needed");
    });
  });
});
