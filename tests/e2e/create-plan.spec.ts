import { test, expect } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// P33: the host's core path through the real UI -- compose, deal, the reveal,
// the plan page -- checked against the rows it wrote. Since P26 the reveal
// shows the dealt nine before the plan exists, so the plan must hold exactly
// the ids the deal returned, three per round, with the host a member and the
// two offered times saved as the "When" poll.
test("a host deals nine, sees the reveal, and lands on a plan holding exactly that deal", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const host = await signInAsMember(context, baseURL!, `Host ${Date.now()}`);
  const admin = localAdmin();
  const title = `E2E create ${Date.now()}`;
  let planId = "";
  try {
    await page.goto("/home");
    await page.locator("summary", { hasText: "Tune it" }).click(); // P25: title and times live under "Tune it"
    await page.locator("#plan-title").fill(title);
    // Two of the suggested times (they appear once the client clock is known).
    const times = page.getByRole("group", { name: /When\?/ }).locator("button[aria-pressed]");
    await expect(times.nth(1)).toBeVisible();
    await times.nth(0).click();
    await times.nth(1).click();
    await expect(times.nth(1)).toHaveAttribute("aria-pressed", "true");

    const dealt = page.waitForResponse((r) => r.url().endsWith("/api/spots/deal") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Deal nine with my settings", exact: true }).click();
    const deal = await (await dealt).json() as { ids: string[] | null };
    expect(deal.ids).toHaveLength(9);
    await expect(page.getByRole("list", { name: "Nine places in three rounds" })).toBeVisible();

    await page.waitForURL(/\/plan\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    planId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(page.getByText(title).first()).toBeVisible();
    await expect(page.getByText("Which times work for you?")).toBeVisible();
    await expect(page.locator("#when-poll-title ~ div button")).toHaveCount(2);

    const [{ data: plan }, { data: links }, { data: access }, { count: options }] = await Promise.all([
      admin.from("plans").select("title,status,stage,pool_count,created_by_user_id").eq("id", planId).single(),
      admin.from("plan_spots").select("spot_id,pool_number").eq("plan_id", planId),
      admin.from("plan_access").select("user_id").eq("plan_id", planId),
      admin.from("plan_time_options").select("id", { count: "exact", head: true }).eq("plan_id", planId),
    ]);
    expect(plan).toEqual({ title, status: "open", stage: "pool", pool_count: 3, created_by_user_id: host.userId });
    expect(links!.map((l) => l.spot_id).sort()).toEqual([...deal.ids!].sort());
    expect([1, 2, 3].map((n) => links!.filter((l) => l.pool_number === n).length)).toEqual([3, 3, 3]);
    expect(access!.map((a) => a.user_id)).toEqual([host.userId]);
    expect(options).toBe(2);
  } finally {
    if (planId) await admin.from("plans").delete().eq("id", planId);
  }
});
