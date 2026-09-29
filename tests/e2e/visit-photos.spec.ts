import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { clientAs, signInAsMember } from "./local-stack";
import { canProvision, SEEDED } from "./plan-factory";

// P33: visit photos in the private bucket, moved here from the
// retired scripts/verify-journey.mjs (step 25). There is no service key in the app, so
// everything below runs on the members' own sessions, as the app does: a
// photo goes into its owner's folder only, is signed for its owner only, and
// is gone once its owner removes it.
test("a photo lands in its owner's folder only, signs for its owner only, and can be removed", async ({ browser, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const contexts = [await browser.newContext(), await browser.newContext()];
  try {
    const [me, friend] = [await signInAsMember(contexts[0], baseURL!, `Snap ${Date.now()}`), await signInAsMember(contexts[1], baseURL!, `Pal ${Date.now()}`)];
    const [mine, theirs] = [clientAs(me), clientAs(friend)];
    const bytes = () => new Blob([new Uint8Array(64)], { type: "image/jpeg" });
    const own = `${me.userId}/${randomUUID()}.jpg`;

    const upload = await mine.storage.from("visit-photos").upload(own, bytes(), { contentType: "image/jpeg" });
    expect(upload.error).toBeNull();
    const foreign = await mine.storage.from("visit-photos").upload(`${friend.userId}/${randomUUID()}.jpg`, bytes(), { contentType: "image/jpeg" });
    expect(foreign.error, "an upload into another member's folder must be refused").not.toBeNull();

    // "I went here" (085's log_visit): a direct plan-less visit insert is refused.
    const { data: logged, error: visitError } = await mine.rpc("log_visit", { p_spot: SEEDED.threeFils, p_visited_at: null });
    expect(visitError).toBeNull();
    const visit = { id: (logged as { result: string; visit_id: string }).visit_id };
    expect(visit.id).toBeTruthy();
    const { error: rowError } = await mine.from("visit_photos")
      .insert({ visit_id: visit.id, person_id: me.userId, storage_path: own, visibility: "private" });
    expect(rowError).toBeNull();

    const signed = await mine.storage.from("visit-photos").createSignedUrls([own], 60);
    const url = signed.data?.[0]?.signedUrl;
    expect(url, "the owner's own session must be able to sign it").toBeTruthy();
    const fetched = await fetch(url!);
    expect(fetched.status).toBe(200);
    const stolen = await theirs.storage.from("visit-photos").createSignedUrls([own], 60);
    expect(stolen.data?.[0]?.signedUrl ?? null, "another member signed someone else's private photo").toBeNull();

    const removed = await mine.storage.from("visit-photos").remove([own]);
    expect(removed.data?.map((f) => f.name)).toEqual([own]); // a refused delete returns 200 [], so check the row
    const { data: left } = await mine.storage.from("visit-photos").list(me.userId);
    expect(left ?? []).toHaveLength(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
