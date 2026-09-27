import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// P33 / P4: a deadline moves the plan on without the host. Before 069 only
// the host's own tab could advance or decide, so a host who closed the app
// froze the group. Here the host never opens the plan at all: one member's
// open tab calls expire_plan when the pool round is overdue (final round, with
// at least an hour to vote), and again when the final round runs out, over
// Realtime, without a reload.
test("with the host away, a member's open tab takes an expired plan to the final round and then decides it", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const admin = localAdmin();
  const away = await browser.newContext();
  const host = await signInAsMember(away, baseURL!, `Host ${Date.now()}`);
  await away.close(); // the host's tab is closed for the whole test

  const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
  await withPlan({ title: `E2E expire ${Date.now()}`, spotIds, createdBy: host.userId,
    deadline: new Date(Date.now() - 60_000).toISOString() }, async (planId) => {
    const context = await browser.newContext();
    try {
      await signInAsMember(context, baseURL!, `Member ${Date.now()}`);
      const page = await context.newPage();
      await page.goto(`/plan/${planId}`);
      const read = async () => (await admin.from("plans").select("status,stage,deadline,winner_spot_id").eq("id", planId).single()).data!;

      await expect.poll(async () => (await read()).stage, { timeout: 20_000, message: "the member's tab never advanced the overdue pool round" })
        .toBe("final");
      expect(Date.parse((await read()).deadline!)).toBeGreaterThan(Date.now() + 55 * 60_000); // R1: the final gets its hour
      await expect(page.locator(".vote-round-label")).toContainText("Final shortlist");

      // The final round runs out while the member watches: no reload.
      await admin.from("plans").update({ deadline: new Date(Date.now() - 1_000).toISOString() }).eq("id", planId);
      await expect.poll(async () => (await read()).status, { timeout: 20_000, message: "the member's tab never decided the overdue final" })
        .toBe("decided");
      const { winner_spot_id: winner } = await read();
      expect(spotIds).toContain(winner);
      const { data: spot } = await admin.from("spots").select("name").eq("id", winner!).single();
      await expect(page.getByRole("heading", { level: 2, name: spot!.name })).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
