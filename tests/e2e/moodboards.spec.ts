import { test, expect, type Page } from "@playwright/test";
import { NO_FIXTURE_REASON } from "./fixture";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision, SEEDED } from "./plan-factory";

// Moodboards in Discover (components/account/MoodboardsSection.tsx), the
// whole lifecycle on one fresh account: create -> save a place from a
// Discover card AND from /place/[id] -> add a link -> remove one item for
// good, remove another and Undo it -> rename -> delete. After each step
// that writes, a RELOAD proves the server has it, not just React state.
//
// The account is minted per test (local-stack.ts) and owns nothing else,
// so every count here is exact. Boards cascade from people, which cascades
// from auth.users, so global-teardown's account sweep removes them.

async function openDiscover(page: Page) {
  await page.goto("/home?view=discover");
  // The create form renders only once the boards have loaded.
  await expect(page.getByLabel("New board name")).toBeVisible({ timeout: 20_000 });
}

const tile = (page: Page, name: string) => page.locator("article.board-tile").filter({ has: page.getByRole("heading", { name, exact: true }) });
const boardTabs = (page: Page) => page.getByRole("group", { name: "Your boards" }).getByRole("button");

async function boardRows(userId: string) {
  const { data, error } = await localAdmin()
    .from("moodboards").select("id, name, moodboard_items(label)").eq("person_id", userId);
  if (error) throw new Error(`reading boards failed: ${error.message}`);
  return data as { id: string; name: string; moodboard_items: { label: string }[] }[];
}

test("a board survives create, save, link, remove with Undo, rename and delete", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), NO_FIXTURE_REASON);
  test.setTimeout(120_000);

  const me = await signInAsMember(context, baseURL!, `Pinner ${Date.now()}`);
  const board = `Date night ${Date.now().toString(36)}`;
  const renamed = `${board} v2`;

  // ── Create ──────────────────────────────────────────────────────────
  await openDiscover(page);
  await expect(page.getByText(/^No boards yet\./)).toBeVisible();
  await page.getByLabel("New board name").fill(board);
  await page.getByRole("button", { name: "New board", exact: true }).click();
  await expect(boardTabs(page)).toHaveCount(1);
  await expect(boardTabs(page).first()).toContainText(board);
  await expect(page.getByText(`${board} is empty.`, { exact: false })).toBeVisible();

  // ── Save a place from a Discover card ───────────────────────────────
  const card = page.locator("article.demo-place-card").filter({ has: page.getByRole("heading", { name: "3Fils", exact: true }) });
  await card.getByRole("button", { name: "Save to board" }).click();
  await card.getByRole("list", { name: "Boards for 3Fils" }).getByRole("button", { name: new RegExp(board) }).click();
  await expect(card.getByText(`Saved to ${board}.`)).toBeVisible();
  await expect(tile(page, "3Fils")).toBeVisible();

  // ── Save a place from /place/[id] ───────────────────────────────────
  await page.goto(`/place/${SEEDED.ravi}`);
  await page.getByRole("button", { name: "Save to board" }).click();
  const placeBoards = page.getByRole("list", { name: "Boards for Ravi Restaurant" });
  await placeBoards.getByRole("button", { name: new RegExp(board) }).click();
  await expect(page.getByText(`Saved to ${board}.`)).toBeVisible();
  // Saving twice is refused in the UI: the board now reads "Already saved".
  await expect(placeBoards.getByRole("button", { name: new RegExp(board) })).toContainText("Already saved");
  await expect(placeBoards.getByRole("button", { name: new RegExp(board) })).toBeDisabled();

  // ── Add a link ──────────────────────────────────────────────────────
  await openDiscover(page);
  await expect(tile(page, "Ravi Restaurant")).toBeVisible(); // the place-page save persisted
  await page.getByLabel("Link", { exact: true }).fill("https://example.com/menu");
  await page.getByLabel("Title", { exact: true }).fill("The menu");
  await page.getByRole("button", { name: "Add link" }).click();
  await expect(tile(page, "The menu")).toContainText("example.com");

  await page.reload();
  await expect(page.getByLabel("New board name")).toBeVisible({ timeout: 20_000 });
  for (const name of ["3Fils", "Ravi Restaurant", "The menu"]) await expect(tile(page, name)).toBeVisible();
  await expect(boardTabs(page).first()).toContainText("3 saved");

  // ── Remove for good: gone after a reload ───────────────────────────
  await page.getByRole("button", { name: "Remove Ravi Restaurant from this board" }).click();
  await expect(tile(page, "Ravi Restaurant")).toHaveCount(0);
  await expect(page.locator(".undo-bar")).toContainText(`Ravi Restaurant removed from ${board}.`);

  // ── Remove, then Undo: back, and still back after a reload ─────────
  await page.getByRole("button", { name: "Remove The menu from this board" }).click();
  await expect(tile(page, "The menu")).toHaveCount(0);
  const undoBar = page.locator(".undo-bar");
  await expect(undoBar).toContainText(`The menu removed from ${board}.`);
  await undoBar.getByRole("button", { name: "Undo" }).click();
  await expect(tile(page, "The menu")).toBeVisible();
  await expect(undoBar).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("New board name")).toBeVisible({ timeout: 20_000 });
  await expect(tile(page, "The menu")).toBeVisible();
  await expect(tile(page, "3Fils")).toBeVisible();
  await expect(tile(page, "Ravi Restaurant")).toHaveCount(0);
  await expect(boardTabs(page).first()).toContainText("2 saved");
  expect((await boardRows(me.userId)).map((b) => b.moodboard_items.map((i) => i.label).sort()))
    .toEqual([["3Fils", "The menu"]]);

  // ── Rename ──────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Board name", { exact: true }).fill(renamed);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(boardTabs(page).first()).toContainText(renamed);
  await page.reload();
  await expect(page.getByLabel("New board name")).toBeVisible({ timeout: 20_000 });
  await expect(boardTabs(page)).toHaveCount(1);
  await expect(boardTabs(page).first()).toContainText(renamed);

  // ── Delete (with its confirm) ───────────────────────────────────────
  await page.getByRole("button", { name: "Delete board" }).click();
  const confirm = page.getByRole("group", { name: "Confirm delete" });
  await expect(confirm).toContainText(`Delete ${renamed} and everything on it?`);
  await confirm.getByRole("button", { name: "Delete board" }).click();
  await expect(boardTabs(page)).toHaveCount(0);
  await expect(page.getByText(/^No boards yet\./)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("New board name")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^No boards yet\./)).toBeVisible();
  expect(await boardRows(me.userId)).toEqual([]);
});
