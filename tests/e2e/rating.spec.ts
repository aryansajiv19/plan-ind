import { test, expect, type Page } from "@playwright/test";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, SEEDED } from "./plan-factory";

// Wave 2 (migration 085): rate places the Beli way. Round trips on one fresh
// account, each checked against the database as well as the screen:
// "I went here" on a place page -> a bucket -> (duels) -> chips -> "Rank it";
// the second loved place is placed by one duel and the scores follow 085's
// rule (score = lo + (hi - lo) * (n - i) / n; loved is 7-10): alone 10.0,
// then 10.0 and 8.5. On Been, My ranking lists both; "x" removes one, the
// other rescores to 10.0, and the removed place is back in "Rate your
// places". Then the log_visit limit: five a Dubai day, the sixth refused.

test.skip(!canProvision(), "needs the local stack to mint an account");

async function wentHere(page: Page, spotId: string, name: string) {
  await page.goto(`/place/${spotId}`);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "I went here" }).click();
  const game = page.getByRole("region", { name: `Rate ${name}` });
  await expect(game).toBeVisible({ timeout: 20_000 });
  return game;
}

async function rankingRows(userId: string) {
  const { data, error } = await localAdmin().from("place_rankings")
    .select("spot_id, bucket, position, score").eq("person_id", userId).order("position");
  if (error) throw new Error(`reading place_rankings failed: ${error.message}`);
  return (data ?? []).map((row) => ({ ...row, score: Number(row.score) }));
}

test("rank two places, see them on Been, remove one and the other rescores", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const me = await signInAsMember(context, baseURL!, `Ranker ${Date.now()}`);

  // ── First place: nothing to compare against, so straight to the chips ─
  let game = await wentHere(page, SEEDED.threeFils, "3Fils");
  await game.locator('.rate-game__bucket[data-bucket="loved"]').click();
  await expect(game.locator(".rate-game__card")).toHaveCount(0);
  await game.getByRole("button", { name: "Rank it" }).click();
  await expect(game.locator(".rate-game__score")).toHaveText("10.0/10", { timeout: 20_000 });
  await page.reload();
  await expect(page.getByText("You ranked it", { exact: false })).toHaveText("You ranked it 10.0/10", { timeout: 20_000 });
  expect(await rankingRows(me.userId)).toEqual([{ spot_id: SEEDED.threeFils, bucket: "loved", position: 1, score: 10 }]);

  // ── Second place: one duel against the first; it wins, lands #1 ─────
  game = await wentHere(page, SEEDED.ravi, "Ravi Restaurant");
  await game.locator('.rate-game__bucket[data-bucket="loved"]').click();
  await expect(game.getByText("Which did you like more?")).toBeVisible();
  const cards = game.locator(".rate-game__card");
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: "3Fils" })).toHaveCount(1);
  await cards.filter({ hasText: "Ravi Restaurant" }).click();
  await game.getByRole("button", { name: "Rank it" }).click();
  await expect(game.locator(".rate-game__score")).toHaveText("10.0/10", { timeout: 20_000 });
  await expect(game).toContainText("#1 of your loved places");
  expect(await rankingRows(me.userId)).toEqual([
    { spot_id: SEEDED.ravi, bucket: "loved", position: 1, score: 10 },
    { spot_id: SEEDED.threeFils, bucket: "loved", position: 2, score: 8.5 },
  ]);
  await page.goto(`/place/${SEEDED.threeFils}`);
  await expect(page.getByText("You ranked it", { exact: false })).toHaveText("You ranked it 8.5/10", { timeout: 20_000 });

  // ── Been: My ranking lists both; nothing left to rate ────────────────
  await page.goto("/home?view=been");
  const list = page.locator(".my-ranking__list");
  await expect(list).toBeVisible({ timeout: 20_000 });
  const rows = list.locator(".my-ranking__band[data-bucket=loved] li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("10.0");
  await expect(rows.nth(0)).toContainText("Ravi Restaurant");
  await expect(rows.nth(1)).toContainText("8.5");
  await expect(rows.nth(1)).toContainText("3Fils");
  await expect(page.locator(".my-ranking__pending")).toHaveCount(0);

  // ── Remove one: the other rescores, and the removed one is rateable again ─
  await list.getByRole("button", { name: "Remove Ravi Restaurant from your ranking" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("10.0");
  await expect(rows.first()).toContainText("3Fils");
  const pending = page.locator(".my-ranking__pending");
  await expect(pending.getByRole("heading", { name: /Rate your places/ })).toContainText("1");
  await expect(pending.getByRole("button", { name: /Ravi Restaurant/ })).toBeVisible();
  await page.reload();
  await expect(rows).toHaveCount(1, { timeout: 20_000 });
  await expect(rows.first()).toContainText("10.0");
  expect(await rankingRows(me.userId)).toEqual([{ spot_id: SEEDED.threeFils, bucket: "loved", position: 1, score: 10 }]);
});

test("\"I went here\" logs five places a day; the sixth is refused and says why", async ({ page, context, baseURL }) => {
  const me = await signInAsMember(context, baseURL!, `Logger ${Date.now()}`);
  const mine = clientAs(me);
  for (const spot of [SEEDED.threeFils, SEEDED.ravi, SEEDED.buQtair, SEEDED.tresind, SEEDED.reif]) {
    const { data, error } = await mine.rpc("log_visit", { p_spot: spot, p_visited_at: null });
    expect(error).toBeNull();
    expect((data as { result: string }).result).toBe("logged");
  }
  const sixth = "c0000000-0000-0000-0000-000000000001"; // Tom & Serg (seed)
  await page.goto(`/place/${sixth}`);
  await page.getByRole("button", { name: "I went here" }).click({ timeout: 20_000 });
  await expect(page.getByText("That's five places logged today. Try again tomorrow.")).toBeVisible();
  await expect(page.getByRole("region", { name: /^Rate / })).toHaveCount(0);

  // The refusal changed nothing: five visits, none of them the sixth place.
  const { data: visits } = await localAdmin().from("visits").select("spot_id").eq("person_id", me.userId);
  expect(visits).toHaveLength(5);
  expect(visits!.some((v) => v.spot_id === sixth)).toBe(false);
});
