import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { clientAs, localAdmin, signInAsMember } from "./local-stack";
import { canProvision, withPlan, SEEDED, FILLER } from "./plan-factory";

// P33 / P14: Settings -> Delete account, the one action here that can't be
// undone. The route empties the account's photo folder with the member's own
// session, then delete_my_account removes the rest and the login, then the
// session is signed out. A photo left behind would block the delete
// (storage_remaining); a login left behind would read as success with the
// data gone. So both are checked, along with a hosted plan and the session.
test("deleting from Settings removes the photos, the hosted plan and the login, and signs the device out", async ({ page, context, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const admin = localAdmin();
  const me = await signInAsMember(context, baseURL!, `Leaver ${Date.now()}`);
  const photo = `${me.userId}/${randomUUID()}.jpg`;
  const { error: uploadError } = await clientAs(me).storage.from("visit-photos")
    .upload(photo, new Blob([new Uint8Array(64)], { type: "image/jpeg" }), { contentType: "image/jpeg" });
  expect(uploadError, "the photo must land for the delete to have something to remove").toBeNull();

  await withPlan({ title: `E2E delete ${Date.now()}`, spotIds: [...Object.values(SEEDED), ...FILLER].slice(0, 9), createdBy: me.userId }, async (planId) => {
    await page.goto("/home?view=profile");
    await page.getByRole("button", { name: "Delete account" }).click();
    const confirm = page.getByRole("button", { name: "Delete my account" });
    await page.getByLabel("Type DELETE to confirm").fill("delete");
    await expect(confirm).toBeDisabled(); // exact word only
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await confirm.click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20_000 });

    const [{ data: login }, { data: files }, { count: plans }] = await Promise.all([
      admin.auth.admin.getUserById(me.userId),
      admin.storage.from("visit-photos").list(me.userId),
      admin.from("plans").select("id", { count: "exact", head: true }).eq("id", planId),
    ]);
    expect(login.user).toBeNull();
    expect(files ?? []).toHaveLength(0);
    expect(plans).toBe(0);

    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/); // the device is signed out, not holding a dead session
  });
});
