import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, SEEDED } from "./plan-factory";

// Wave 3 (migration 086): leaderboards on the Friends tab. Points are derived
// from real rows (086's board_points), so each account earns its own through
// its own session: "I went here" is 085's log_visit, a ranking is rank_place.
// What one I-went-here plus one ranking is worth depends on the board:
//   a new place 10 + its first area 20 + a ranking 5 = 35 on Friends and All
//   Dubai; an area board counts no area points, so 15 there.
// Hiding (Settings) takes you off the public boards (All Dubai, area) for
// everyone else; your friends still see you, and you always see your own row.
// A place board is you and your friends who ranked it, no one else.

test.skip(!canProvision(), "needs the local stack to mint accounts");

// Single-word names, so a board's "first name + initial" label is the whole
// name and can't collide with another run's.
const uniqueName = (stem: string) => `${stem}${randomBytes(3).toString("hex")}`;

type Member = Awaited<ReturnType<typeof signInAsMember>>;
async function account(browser: Browser, baseURL: string, stem: string): Promise<{ me: Member; page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  const me = await signInAsMember(context, baseURL, uniqueName(stem));
  return { me, page: await context.newPage(), context };
}

/** I went here + ranked it loved, on the member's own session. */
async function wentAndRanked(me: Member, spotId: string) {
  const mine = clientAs(me);
  const logged = await mine.rpc("log_visit", { p_spot: spotId, p_visited_at: null });
  expect((logged.data as { result: string } | null)?.result, JSON.stringify(logged.error)).toBe("logged");
  const ranked = await mine.rpc("rank_place", { p_spot: spotId, p_bucket: "loved" });
  expect((ranked.data as { result: string } | null)?.result, JSON.stringify(ranked.error)).toBe("ranked");
}

async function befriend(a: Member, b: Member) {
  const { error } = await localAdmin().from("friendships").insert({ person_id: a.userId, friend_id: b.userId }); // mirrored by trigger
  expect(error).toBeNull();
}

async function openBoards(page: Page) {
  await page.goto("/home?view=friends");
  const boards = page.locator("section.boards");
  await expect(boards).toBeVisible({ timeout: 20_000 });
  await boards.locator("summary").click(); // folded by default; friends come first
  return boards;
}
const scopeTab = (boards: ReturnType<Page["locator"]>, name: string) => boards.getByRole("tablist", { name: "Board" }).getByRole("tab", { name, exact: true });
const rowOf = (boards: ReturnType<Page["locator"]>, name: string) => boards.locator(".boards__row", { has: boards.page().locator(".boards__name", { hasText: new RegExp(`^${name}$`) }) });

test("points by board and period, my row pinned, a friend on Friends", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const [a, b] = [await account(browser, baseURL!, "Rana"), await account(browser, baseURL!, "Omar")];
  try {
    await wentAndRanked(a.me, SEEDED.threeFils); // Jumeirah
    await befriend(a.me, b.me);
    // An older first visit, two months back, at a place in another area: all-time only (10 + 20).
    // 085's visits_server_time stamps created_at on insert (as it should), so
    // the history is set by a second write, which that trigger leaves alone.
    const admin = localAdmin();
    const { data: old, error } = await admin.from("visits").insert({ person_id: a.me.userId, spot_id: SEEDED.ravi }).select("id").single();
    expect(error, JSON.stringify(error)).toBeNull();
    const backdated = await admin.from("visits").update({ created_at: new Date(Date.now() - 60 * 86_400_000).toISOString() }).eq("id", old!.id).select("created_at").single();
    expect(new Date(backdated.data!.created_at).getTime()).toBeLessThan(Date.now() - 50 * 86_400_000);

    const boards = await openBoards(a.page);
    await expect(scopeTab(boards, "Friends")).toHaveAttribute("aria-selected", "true");
    const mine = boards.locator(".boards__row[data-me]");
    await expect(mine).toHaveCount(1);
    await expect(mine.locator(".boards__name")).toHaveText("You");
    await expect(mine.locator(".boards__points")).toHaveText("35 pts");
    // A friend with no points isn't listed (086 lists ranked rows, plus you);
    // once they earn, they are, with their points.
    await expect(rowOf(boards, b.me.name)).toHaveCount(0);
    await wentAndRanked(b.me, SEEDED.buQtair); // Umm Suqeim: 10 + 20 + 5
    await openBoards(a.page); // reloads, and the fold starts closed again
    await expect(rowOf(boards, b.me.name).locator(".boards__points")).toHaveText("35 pts", { timeout: 20_000 });

    await boards.getByRole("group", { name: "Period" }).getByRole("button", { name: "All time" }).click();
    await expect(mine.locator(".boards__points")).toHaveText("65 pts");
    await boards.getByRole("group", { name: "Period" }).getByRole("button", { name: "This month" }).click();
    await expect(mine.locator(".boards__points")).toHaveText("35 pts");

    await scopeTab(boards, "All Dubai").click();
    await expect(mine.locator(".boards__points")).toHaveText("35 pts");
    await expect(rowOf(boards, b.me.name), "on the public board too, not hidden").toHaveCount(1);

    await scopeTab(boards, "By area").click();
    await boards.getByLabel("Area").selectOption("Jumeirah");
    await expect(mine.locator(".boards__points")).toHaveText("15 pts"); // no area points on an area board
  } finally {
    await Promise.all([a.context.close(), b.context.close()]);
  }
});

test("hiding takes me off others' public boards; friends and I still see me", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const [hider, friend, stranger] = [await account(browser, baseURL!, "Hana"), await account(browser, baseURL!, "Faris"), await account(browser, baseURL!, "Samir")];
  try {
    await wentAndRanked(hider.me, SEEDED.buQtair);
    await befriend(hider.me, friend.me);

    const strangerBoards = await openBoards(stranger.page);
    await scopeTab(strangerBoards, "All Dubai").click();
    await expect(rowOf(strangerBoards, hider.me.name)).toHaveCount(1);

    // Settings: the switch persists (checked after a reload) and in the database.
    await hider.page.goto("/home?view=profile");
    // Scoped: while a view streams in, React parks a hidden copy outside #workspace.
    const toggle = hider.page.locator("#workspace").getByLabel("Hide me from public leaderboards");
    await expect(toggle).toBeEnabled({ timeout: 20_000 });
    await toggle.check();
    await hider.page.reload();
    await expect(hider.page.locator("#workspace").getByLabel("Hide me from public leaderboards")).toBeChecked({ timeout: 20_000 });
    const { data: person } = await localAdmin().from("people").select("hide_from_boards").eq("id", hider.me.userId).single();
    expect(person?.hide_from_boards).toBe(true);

    await strangerBoards.page().reload();
    const again = await openBoards(stranger.page);
    await scopeTab(again, "All Dubai").click();
    await expect(again.locator(".boards__row").first()).toBeVisible();
    await expect(rowOf(again, hider.me.name), "a hidden account is off the public board").toHaveCount(0);

    const friendBoards = await openBoards(friend.page);
    await expect(rowOf(friendBoards, hider.me.name), "friends still see a hidden account").toHaveCount(1);
    await expect(rowOf(friendBoards, hider.me.name).locator(".boards__points")).toHaveText("35 pts");

    const ownBoards = await openBoards(hider.page);
    await scopeTab(ownBoards, "All Dubai").click();
    await expect(ownBoards.locator(".boards__row[data-me] .boards__points")).toHaveText("35 pts");
  } finally {
    await Promise.all([hider.context.close(), friend.context.close(), stranger.context.close()]);
  }
});

test("a place board is me and my friends who ranked it, never a stranger", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const [me, friend, stranger] = [await account(browser, baseURL!, "Layla"), await account(browser, baseURL!, "Karim"), await account(browser, baseURL!, "Nadia")];
  try {
    for (const who of [me, friend, stranger]) await wentAndRanked(who.me, SEEDED.tresind);
    await befriend(me.me, friend.me);

    const boards = await openBoards(me.page);
    await scopeTab(boards, "By place").click();
    await boards.getByLabel("Place").selectOption({ label: "Tresind Studio" });
    await expect(boards.getByRole("group", { name: "Period" }), "a place board has no period switch").toHaveCount(0);
    const rows = boards.locator(".boards__row");
    await expect(rows).toHaveCount(2);
    await expect(boards.locator(".boards__row[data-me] .boards__points")).toHaveText("Loved it");
    await expect(rowOf(boards, friend.me.name)).toHaveCount(1);
    await expect(rowOf(boards, stranger.me.name)).toHaveCount(0);
  } finally {
    await Promise.all([me.context.close(), friend.context.close(), stranger.context.close()]);
  }
});
