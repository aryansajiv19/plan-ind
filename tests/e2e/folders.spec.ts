import { test, expect, type Page } from "@playwright/test";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// Folders on the Saved tab (081; wave 1b moved them off Discover): create one, rename it, move a list into it,
// delete it, and the list is still there, back under Unfiled. Every new
// account has a "Want to try" list to move.

const group = (page: Page, heading: string | RegExp) =>
  page.locator(".saved-folders__group", { has: page.getByRole("heading", { level: 3, name: heading }) });

test("a folder is created, renamed, filled, and deleted with its list kept", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const member = await signInAsMember(context, baseURL!, `Farah ${Date.now()}`);
  await page.goto("/home?view=discover");
  await expect(page.locator("#workspace"), "Discover has settled").toBeVisible({ timeout: 20_000 });
  await expect(page.locator("section.saved-folders"), "folders live on Saved, not Discover").toHaveCount(0);
  await page.goto("/home?view=saved");
  const section = page.locator("section.saved-folders");
  await expect(section).toBeVisible({ timeout: 20_000 });

  await section.getByLabel("Folder name").fill("Date nights");
  await section.getByRole("button", { name: "New folder" }).click();
  await expect(group(page, /Date nights/)).toBeVisible();

  await group(page, /Date nights/).getByRole("button", { name: "Rename" }).click();
  await section.getByRole("textbox", { name: "Folder name" }).last().fill("Weekend plans");
  await section.getByRole("button", { name: "Save" }).click();
  await expect(group(page, /Weekend plans/)).toBeVisible();
  await expect(group(page, /Date nights/)).toHaveCount(0);

  await section.getByLabel("Move Want to try to folder").selectOption({ label: "📁 Weekend plans" });
  await expect(group(page, /Weekend plans/)).toContainText("Want to try");

  await group(page, /Weekend plans/).getByRole("button", { name: "Delete", exact: true }).click();
  await group(page, /Weekend plans/).getByRole("button", { name: "Delete folder (lists stay)" }).click();
  await expect(group(page, /Weekend plans/)).toHaveCount(0);
  await expect(group(page, "Unfiled")).toContainText("Want to try");

  // The world, not just the screen: no folder left, and the list survived unfiled.
  const admin = localAdmin();
  const { data: folders } = await admin.from("folders").select("id").eq("person_id", member.userId);
  expect(folders).toEqual([]);
  const { data: lists } = await admin.from("place_collections").select("folder_id").eq("person_id", member.userId).eq("kind", "want_to_try");
  expect(lists).toEqual([{ folder_id: null }]);
});
