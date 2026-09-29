import { test, expect, type Page } from "@playwright/test";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, SEEDED } from "./plan-factory";

// The Been tab, signed in (wave 1b's simpler Been): one bar with the
// collection chips, "+ Collection" and "+ Photo"; "Add [place] to
// [collection]" inline. Round trips, each proven against the database, not
// just the screen: a collection is created, a visit filed in it (its chip
// counts 1, still after a reload), and the collection deleted with the visit
// kept; a photo picked, saved, and shown on the wall. The member's visit is
// logged on their own session with log_visit, as "I went here" does (085:
// a direct plan-less insert is refused).

test.skip(!canProvision(), "needs the local stack to mint an account");

// A real 1x1 PNG: the upload validates the type, and the wall renders it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

const chip = (page: Page, name: RegExp) => page.getByRole("tablist", { name: "Visit collections" }).getByRole("tab", { name });
async function openBeen(page: Page) {
  await page.goto("/home?view=been");
  await expect(page.getByRole("button", { name: "+ Collection" })).toBeVisible({ timeout: 20_000 });
}

test("a collection is made, a visit filed in it, and the collection deleted with the visit kept", async ({ page, context, baseURL }) => {
  const me = await signInAsMember(context, baseURL!, `Beenie ${Date.now()}`);
  const { data: logged, error } = await clientAs(me).rpc("log_visit", { p_spot: SEEDED.threeFils, p_visited_at: null });
  expect(error).toBeNull();
  expect((logged as { result: string }).result).toBe("logged");
  const name = `Date nights ${Date.now().toString(36)}`;

  await openBeen(page);
  await page.getByRole("button", { name: "+ Collection" }).click();
  await page.locator("#collection-name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(chip(page, new RegExp(name))).toContainText("0");

  // Creating selects the new collection; filing happens from All places.
  await chip(page, /^All places/).click();
  const add = page.locator("form.been-inline", { has: page.getByLabel("Visit") });
  await add.getByLabel("Visit").selectOption({ label: "3Fils" });
  await add.getByLabel("Collection").selectOption({ label: name });
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(chip(page, new RegExp(name))).toContainText("1");
  await page.reload();
  await expect(chip(page, new RegExp(name))).toContainText("1", { timeout: 20_000 });

  const admin = localAdmin();
  const { data: made } = await admin.from("visit_collections").select("id, visit_collection_items(visit_id)").eq("person_id", me.userId);
  expect(made?.map((c) => c.visit_collection_items.length)).toEqual([1]);

  await chip(page, new RegExp(name)).click();
  await page.getByRole("button", { name: "Delete this collection" }).click();
  await page.getByRole("group", { name: "Confirm delete collection" }).getByRole("button", { name: "Delete collection" }).click();
  await expect(chip(page, new RegExp(name))).toHaveCount(0);
  await expect(chip(page, /^All places/)).toContainText("1"); // the visit stays in the log

  const { data: left } = await admin.from("visit_collections").select("id").eq("person_id", me.userId);
  expect(left).toEqual([]);
  const { data: visits } = await admin.from("visits").select("id").eq("person_id", me.userId);
  expect(visits).toHaveLength(1);
});

test("a photo picked on Been is saved to the visit and shows on the wall", async ({ page, context, baseURL }) => {
  const me = await signInAsMember(context, baseURL!, `Snapper ${Date.now()}`);
  const { data, error } = await clientAs(me).rpc("log_visit", { p_spot: SEEDED.threeFils, p_visited_at: null });
  expect(error).toBeNull();
  const visit = { id: (data as { result: string; visit_id: string }).visit_id };
  expect(visit.id).toBeTruthy();

  await openBeen(page);
  // The composer appears only once a file is picked.
  await expect(page.getByRole("button", { name: "Save photo" })).toHaveCount(0);
  await page.locator(".been-bar input[type=file]").setInputFiles({ name: "night.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByLabel("Attach to")).toHaveValue(visit.id);
  await page.getByRole("button", { name: "Save photo" }).click();

  // The world: one photo row on that visit, its file in the owner's own folder.
  // Polled: the button reads "Uploading…" while it works, so its absence alone proves nothing.
  const photoRows = async () => (await localAdmin().from("visit_photos").select("storage_path").eq("visit_id", visit.id)).data ?? [];
  await expect.poll(async () => (await photoRows()).length, { timeout: 20_000 }).toBe(1);
  const rows = await photoRows();
  // Saved: the composer closes, with no error left behind.
  await expect(page.locator(".demo-photo-composer")).toHaveCount(0, { timeout: 20_000 });
  expect(rows[0].storage_path.startsWith(`${me.userId}/`)).toBe(true);
  const { data: files } = await clientAs(me).storage.from("visit-photos").list(me.userId);
  expect(files ?? []).toHaveLength(1);

  // And the screen: the wall now carries it.
  const file = rows[0].storage_path.split("/")[1];
  const wallImage = page.locator(`#workspace img[src*="${encodeURIComponent(file)}"], #workspace img[src*="${file}"]`);
  await expect(wallImage.first()).toBeAttached({ timeout: 20_000 });
});
