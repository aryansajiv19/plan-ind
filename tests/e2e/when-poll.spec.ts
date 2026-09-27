import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// P33 / P21: the "When" poll across two accounts. A member ticks a time; the
// host's open tab shows it without a reload; when the plan is decided the
// ticked time becomes the plan's time and the decided screen says the poll
// chose it. The rounds are closed by their deadlines (expire_plan), which
// runs the same plan_transition as the host's Decide button.
test("a member's tick reaches the host live, and deciding makes the ticked time the plan's time", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const admin = localAdmin();
  const [hostContext, memberContext] = [await browser.newContext(), await browser.newContext()];
  try {
    const host = await signInAsMember(hostContext, baseURL!, `Host ${Date.now()}`);
    await signInAsMember(memberContext, baseURL!, `Mia ${Date.now()}`);
    const hour = (days: number) => new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000 + days * 86_400_000).toISOString();

    await withPlan({ title: `E2E when ${Date.now()}`, spotIds: [...Object.values(SEEDED), ...FILLER].slice(0, 9),
      createdBy: host.userId, deadline: hour(1) }, async (planId) => {
      const { data: options, error } = await admin.from("plan_time_options")
        .insert([{ plan_id: planId, starts_at: hour(2) }, { plan_id: planId, starts_at: hour(3) }]).select("id,starts_at");
      expect(error).toBeNull();
      const later = options!.find((o) => Date.parse(o.starts_at) === Date.parse(hour(3)))!;

      const hostPage = await hostContext.newPage();
      await hostPage.goto(`/plan/${planId}`);
      const hostTimes = hostPage.locator("#when-poll-title ~ div button");
      await expect(hostTimes).toHaveCount(2, { timeout: 20_000 });
      await expect(hostTimes.nth(1)).toContainText("Nobody yet");

      const memberPage = await memberContext.newPage();
      await memberPage.goto(`/plan/${planId}`);
      const memberTimes = memberPage.locator("#when-poll-title ~ div button");
      await expect(memberTimes.nth(1)).toBeEnabled({ timeout: 20_000 });
      await memberTimes.nth(1).click();
      await expect(memberTimes.nth(1)).toHaveAttribute("aria-pressed", "true");

      // The host's tab, untouched since it loaded: only Realtime can bring this.
      await expect(hostTimes.nth(1)).toContainText("1 can make it", { timeout: 15_000 });
      await expect(hostTimes.nth(1)).toHaveAttribute("aria-pressed", "false"); // the member's tick, not the host's

      // Close both rounds by their deadlines; the open tabs move the plan on.
      const read = async () => (await admin.from("plans").select("status,stage,event_time").eq("id", planId).single()).data!;
      await admin.from("plans").update({ deadline: new Date(Date.now() - 1_000).toISOString() }).eq("id", planId);
      await expect.poll(async () => (await read()).stage, { timeout: 20_000 }).toBe("final");
      await admin.from("plans").update({ deadline: new Date(Date.now() - 1_000).toISOString() }).eq("id", planId);
      await expect.poll(async () => (await read()).status, { timeout: 20_000 }).toBe("decided");

      expect(Date.parse((await read()).event_time!)).toBe(Date.parse(later.starts_at));
      await expect(memberPage.getByText("From the time poll: 1 person said this works.")).toBeVisible({ timeout: 15_000 });
    });
  } finally {
    await Promise.all([hostContext.close(), memberContext.close()]);
  }
});
