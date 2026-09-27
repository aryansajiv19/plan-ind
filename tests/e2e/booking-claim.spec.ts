import { test, expect, type Browser, type Page } from "@playwright/test";
import { clientAs, localAdmin, signInAsMember, type Member } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// 075: any member of a decided plan says "I'll book it" (claim_booking),
// hands it back (release_booking), and the holder or the host marks it
// booked (mark_booked), after which nothing moves. Two accounts in two
// browsers, from Session A's booking.mjs: every change on one screen must
// reach the other over Realtime, with no reload.

const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
const section = (page: Page) => page.locator("div.border-t", { has: page.getByText("Booking", { exact: true }) }).first();
/**
 * Resolves once Realtime says row changes will flow ("Subscribed to
 * PostgreSQL"). The page's SUBSCRIBED status comes earlier, on the join
 * reply; a change in between is not delivered, so acting before this raced
 * the other screen (a CI flake). Attach before navigating.
 */
function realtimeReady(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (ws) => ws.on("framereceived", ({ payload }) => {
      if (String(payload).includes("Subscribed to PostgreSQL")) resolve();
    }));
  });
}
const holderOf = async (planId: string) =>
  (await localAdmin().from("plan_booking_owners").select("user_id").eq("plan_id", planId).maybeSingle()).data?.user_id ?? null;

/** A decided plan the host created; host and member each have it open. */
async function decidedPlanWithTwo(browser: Browser, baseURL: string,
  run: (s: { planId: string; host: Member; member: Member; hostPage: Page; memberPage: Page }) => Promise<void>) {
  const [hostContext, memberContext] = [await browser.newContext(), await browser.newContext()];
  try {
    const stamp = Date.now();
    const host = await signInAsMember(hostContext, baseURL, `Hana ${stamp}`);
    const member = await signInAsMember(memberContext, baseURL, `Mira ${stamp}`);
    await withPlan({ title: `E2E booking ${stamp}`, spotIds, status: "decided", winnerSpotId: SEEDED.threeFils,
      createdBy: host.userId }, async (planId) => {
      const [hostPage, memberPage] = [await hostContext.newPage(), await memberContext.newPage()];
      for (const page of [hostPage, memberPage]) {
        const ready = realtimeReady(page);
        await page.goto(`/plan/${planId}`);
        await expect(section(page)).toBeVisible({ timeout: 20_000 });
        await ready;
      }
      await run({ planId, host, member, hostPage, memberPage });
    });
  } finally {
    await Promise.all([hostContext.close(), memberContext.close()]);
  }
}

test("a member claims the booking, the host sees it live, and a release and re-claim go through", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(memberPage)).toContainText("You’re booking it.");
    await expect(section(hostPage)).toContainText(`${member.name}’s booking it.`, { timeout: 15_000 }); // Realtime
    expect(await holderOf(planId)).toBe(member.userId);

    await section(memberPage).getByRole("button", { name: "I can’t book after all" }).click();
    await expect(section(hostPage).getByRole("button", { name: "I’ll book it" })).toBeVisible({ timeout: 15_000 });
    expect(await holderOf(planId)).toBeNull();

    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(hostPage)).toContainText(`${member.name}’s booking it.`, { timeout: 15_000 });
  });
});

test("the holder marks it booked, both screens freeze, and the server refuses to move it", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, host, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(memberPage)).toContainText("You’re booking it.");
    await section(memberPage).getByRole("button", { name: "Mark as booked" }).click();

    for (const page of [memberPage, hostPage]) {
      await expect(section(page)).toContainText(`Booked by ${member.name}`, { timeout: 15_000 });
      await expect(section(page).getByRole("button", { name: /I’ll book it|I can’t book after all/ })).toHaveCount(0);
    }
    const { data } = await localAdmin().from("plans").select("booked").eq("id", planId).single();
    expect(data!.booked).toBe(true);
    // Frozen on the server too, not only on screen.
    expect((await clientAs(host).rpc("claim_booking", { p_plan_id: planId })).data).toMatchObject({ result: "booked" });
    expect((await clientAs(member).rpc("release_booking", { p_plan_id: planId })).data).toMatchObject({ result: "booked" });
  });
});

test("tapping on a stale screen after someone else claimed shows who has it, and changes nothing", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, member, hostPage, memberPage }) => {
    // The host's socket is cut, so its screen still offers the claim.
    await hostPage.routeWebSocket(/realtime/, () => {});
    await hostPage.reload();
    const stale = section(hostPage).getByRole("button", { name: "I’ll book it" });
    await expect(stale).toBeVisible({ timeout: 20_000 });

    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(memberPage)).toContainText("You’re booking it.");
    await stale.click();
    await expect(section(hostPage)).toContainText(`${member.name} got there first`);
    await expect(section(hostPage)).toContainText(`${member.name}’s booking it.`);
    expect(await holderOf(planId)).toBe(member.userId); // the member keeps it
  });
});
