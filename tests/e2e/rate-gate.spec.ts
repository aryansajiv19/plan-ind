import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// P33 / P11: rating opens after the outing. The page must hide the stars
// while rate_plan would refuse them (a button that errors is the bug), then
// offer them once the time has passed; and a rating is undoable: removing it
// takes the rating and the visit it logged, and the screen goes back.
test("rating is hidden before the outing, offered after it, and removing it puts everything back", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const admin = localAdmin();
  const member = await signInAsMember(context, baseURL!, `Rater ${Date.now()}`);
  const spotIds = [...Object.values(SEEDED), ...FILLER].slice(0, 9);
  const winner = SEEDED.threeFils;

  await withPlan({ title: `E2E rate ${Date.now()}`, spotIds, status: "decided", winnerSpotId: winner,
    eventTime: new Date(Date.now() + 2 * 3_600_000).toISOString() }, async (planId) => {
    await page.goto(`/plan/${planId}`);
    await expect(page.getByText("Rate it after you’ve been.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Rate 4 out of 5" })).toHaveCount(0);
    // The server agrees: the gate isn't only cosmetic.
    const early = await clientAs(member).rpc("rate_plan", {
      p_plan_id: planId, p_spot_id: winner, p_voter_name: member.name, p_stars: 4, p_again: true,
      p_participant_token_hash: randomBytes(32).toString("hex"),
    });
    expect(early.error?.message).toMatch(/Rating opens after the outing/);

    await admin.from("plans").update({ event_time: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", planId);
    await page.reload();
    const four = page.getByRole("button", { name: "Rate 4 out of 5" });
    await four.click();
    await expect(four).toHaveAttribute("aria-pressed", "true");
    const counts = async () => Promise.all([
      admin.from("ratings").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("user_id", member.userId),
      admin.from("visits").select("id", { count: "exact", head: true }).eq("plan_id", planId).eq("person_id", member.userId),
    ]).then(([r, v]) => [r.count, v.count]);
    await expect.poll(counts, { timeout: 10_000 }).toEqual([1, 1]);

    await page.getByRole("button", { name: "Remove my rating" }).click();
    await page.getByRole("button", { name: "Remove rating" }).click();
    await expect(four).toHaveAttribute("aria-pressed", "false", { timeout: 10_000 });
    await expect.poll(counts, { timeout: 10_000 }).toEqual([0, 0]);
  });
});
