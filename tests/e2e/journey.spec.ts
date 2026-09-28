import { test, expect } from "@playwright/test";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";
import { bookingSection, realtimeReady } from "./page-helpers";

// One journey through the real UI, start to finish, on the job's own stack:
// a brand-new account onboards, deals a plan, a friend joins by the link and
// votes, the host closes every round and decides, and the booking is claimed
// and marked -- with both refusals on the way. The steps other specs already
// pin in depth (create-plan, guest-vote, realtime-multi-client, booking-claim)
// are walked here only as far as the seams between them: each step starting
// from the state the previous one really left, not from an admin fixture.
//
// Not automatable: the email code and Turnstile of a real sign-in (a
// production build won't let a script solve them), so the account is minted
// and its session injected -- but with no profile and no birthday, exactly
// what a first sign-in leaves, so /onboarding runs for real.

test("a new member onboards, deals, a friend joins by link and votes, the host decides, and the booking is claimed and marked", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint accounts");
  test.setTimeout(240_000);
  const stamp = Date.now();
  const contexts = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
  const [hostContext, friendContext, lateContext] = contexts;
  let planId = "";
  try {
    // ── Sign up: first sign-in lands on /onboarding ─────────────────────────
    const host = await signInAsMember(hostContext, baseURL!, `Nour ${stamp}`, { onboarded: false });
    const hostPage = await hostContext.newPage();
    await hostPage.goto("/home");
    await hostPage.waitForURL(/\/onboarding/);
    await hostPage.getByLabel("What should friends call you?").fill(host.name);
    // By id: getByLabel("Date of birth") matches two elements on this page.
    await hostPage.locator("#onboarding-dateOfBirth").fill("1994-05-02");
    await hostPage.getByRole("button", { name: "Continue" }).click();
    await hostPage.waitForURL((url) => url.pathname === "/home", { timeout: 20_000 });

    // ── Create: deal nine and land on the plan ──────────────────────────────
    await hostPage.locator("summary", { hasText: "Tune it" }).click();
    await hostPage.locator("#plan-title").fill(`E2E journey ${stamp}`);
    await hostPage.getByRole("button", { name: "Deal nine", exact: true }).click();
    await hostPage.waitForURL(/\/plan\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    planId = new URL(hostPage.url()).pathname.split("/").pop()!;
    await expect(hostPage.getByText(`Hey ${host.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });

    // ── Share: the friend opens the link and is in ──────────────────────────
    const friend = await signInAsMember(friendContext, baseURL!, `Omar ${stamp}`);
    const friendPage = await friendContext.newPage();
    const friendLive = realtimeReady(friendPage);
    await friendPage.goto(`/plan/${planId}`);
    await expect(friendPage.getByText(`Hey ${friend.name}`, { exact: true })).toBeVisible({ timeout: 20_000 });
    await friendLive;

    // ── Vote: the host picks in every pool round and builds the shortlist ───
    const choices = (page: typeof hostPage) => page.locator(".vote-options-grid .vote-option__choice");
    for (const next of ["Continue to round 2", "Continue to round 3", "Build the final shortlist"]) {
      await choices(hostPage).first().click();
      await expect(choices(hostPage).first()).toHaveAttribute("aria-pressed", "true");
      await hostPage.getByRole("button", { name: next }).click();
    }
    // The friend's screen reaches the final round over Realtime, and they vote in it.
    await expect(friendPage.locator(".vote-round-label")).toContainText("Final shortlist", { timeout: 15_000 });
    await choices(friendPage).first().click();
    await expect(choices(friendPage).first()).toHaveAttribute("aria-pressed", "true");

    // ── Decide: the host chooses; both screens show the winner ──────────────
    await choices(hostPage).first().click();
    await hostPage.getByRole("button", { name: "Choose the final place" }).click();
    const admin = localAdmin();
    await expect.poll(async () => (await admin.from("plans").select("status").eq("id", planId).single()).data?.status,
      { timeout: 15_000 }).toBe("decided");
    const { data: plan } = await admin.from("plans").select("winner_spot_id").eq("id", planId).single();
    const { data: winner } = await admin.from("spots").select("name").eq("id", plan!.winner_spot_id!).single();
    for (const page of [hostPage, friendPage]) {
      await expect(page.getByRole("heading", { level: 2, name: winner!.name })).toBeVisible({ timeout: 15_000 });
    }

    // ── Booking, refusal 1: a late link-holder can claim but not mark it ────
    const late = await signInAsMember(lateContext, baseURL!, `Lina ${stamp}`);
    const latePage = await lateContext.newPage();
    await latePage.goto(`/plan/${planId}`);
    await bookingSection(latePage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(bookingSection(latePage)).toContainText("You’re booking it.");
    await bookingSection(latePage).getByRole("button", { name: "Mark as booked" }).click();
    await expect(bookingSection(latePage)).toContainText(
      "Only someone who was in the plan before it was decided, or the host, can mark it booked.");
    await bookingSection(latePage).getByRole("button", { name: "I can’t book after all" }).click();
    await expect(bookingSection(friendPage).getByRole("button", { name: "I’ll book it" })).toBeVisible({ timeout: 15_000 });

    // ── Booking, refusal 2: a member who isn't holding it can't mark it ─────
    await bookingSection(friendPage).getByRole("button", { name: "I’ll book it" }).click();
    await expect(bookingSection(friendPage)).toContainText("You’re booking it.");
    const refused = await clientAs(late).rpc("mark_booked", { p_plan_id: planId, p_booked: true });
    expect(refused.data).toMatchObject({ result: "not_holder", booked: false }); // the UI never offers it (booking-claim)

    // ── Booking: the friend, there before the decision, marks it booked ─────
    await bookingSection(friendPage).getByRole("button", { name: "Mark as booked" }).click();
    for (const page of [friendPage, hostPage]) {
      await expect(bookingSection(page)).toContainText(`Booked by ${friend.name}`, { timeout: 15_000 });
    }
    const { data: booked } = await admin.from("plans").select("booked, booking_owner").eq("id", planId).single();
    expect(booked).toEqual({ booked: true, booking_owner: friend.name });
  } finally {
    if (planId) await localAdmin().from("plans").delete().eq("id", planId);
    await Promise.all(contexts.map((context) => context.close()));
  }
});
