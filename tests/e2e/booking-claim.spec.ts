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
      // Both were in the plan before it was decided (078: a holder who joined
      // after the decision can't mark it booked), so stamp decided_at after.
      const admin = localAdmin();
      await admin.from("plan_access").insert([{ plan_id: planId, user_id: host.userId }, { plan_id: planId, user_id: member.userId }]);
      await admin.from("plans").update({ decided_at: new Date(Date.now() + 1_000).toISOString() }).eq("id", planId);
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

// ── 078 (security review of 075) ─────────────────────────────────────────────
test("a member who doesn't hold it is never offered Mark as booked; the host is", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(memberPage)).toContainText("You’re booking it.");
    const bystanderContext = await browser.newContext();
    try {
      await signInAsMember(bystanderContext, baseURL!, `Bo ${Date.now()}`);
      const bystander = await bystanderContext.newPage();
      await bystander.goto(`/plan/${planId}`);
      await expect(section(bystander)).toContainText(`${member.name}’s booking it.`, { timeout: 20_000 });
      await expect(section(bystander).getByRole("button", { name: "Mark as booked" })).toHaveCount(0);
    } finally {
      await bystanderContext.close();
    }
    await expect(section(hostPage).getByRole("button", { name: "Mark as booked" })).toBeVisible();
  });
});

test("the host can unmark a booking the holder made, and the claim stays theirs", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await section(memberPage).getByRole("button", { name: "Mark as booked" }).click();
    await expect(section(hostPage)).toContainText(`Booked by ${member.name}`, { timeout: 15_000 });
    await section(hostPage).getByRole("button", { name: "Unmark booked" }).click();
    for (const page of [hostPage, memberPage]) {
      await expect(section(page)).not.toContainText("Booked by", { timeout: 15_000 });
    }
    await expect(section(memberPage)).toContainText("You’re booking it.");
    const { data } = await localAdmin().from("plans").select("booked").eq("id", planId).single();
    expect(data!.booked).toBe(false);
    expect(await holderOf(planId)).toBe(member.userId);
  });
});

test("a holder who deletes their account frees the claim for everyone (it used to stick as 'Former member')", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, host, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(hostPage)).toContainText(`${member.name}’s booking it.`, { timeout: 15_000 });
    const { data } = await clientAs(member).rpc("delete_my_account", { p_probe: false });
    expect(data).toMatchObject({ result: "deleted" });
    const claimAgain = section(hostPage).getByRole("button", { name: "I’ll book it" });
    await expect(claimAgain).toBeVisible({ timeout: 15_000 }); // over Realtime, no reload
    await claimAgain.click();
    await expect(section(hostPage)).toContainText("You’re booking it.");
    expect(await holderOf(planId)).toBe(host.userId);
  });
});

test("the host clears a claim someone else holds, and both screens offer it again", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await decidedPlanWithTwo(browser, baseURL!, async ({ planId, member, hostPage, memberPage }) => {
    await section(memberPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(section(hostPage)).toContainText(`${member.name}’s booking it.`, { timeout: 15_000 });
    await expect(section(memberPage).getByRole("button", { name: "Clear the booking" })).toHaveCount(0); // the host's only
    await section(hostPage).getByRole("button", { name: "Clear the booking" }).click();
    for (const page of [hostPage, memberPage]) {
      await expect(section(page).getByRole("button", { name: "I’ll book it" })).toBeVisible({ timeout: 15_000 });
    }
    expect(await holderOf(planId)).toBeNull();
  });
});
