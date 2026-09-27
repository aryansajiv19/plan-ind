import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { localAdmin, signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// P33: the place-link intake's seams, moved here from scripts/verify-journey.mjs
// (steps 21-24). Instagram links on purpose: with no provider credentials they
// resolve to needs_input without a network call, so the run is deterministic.
// Matching and safe-fetch are unit tests (place-import-*.test.ts).

/** POSTs as the signed-in member, with the route's double-submit CSRF check. */
async function saver(context: BrowserContext, request: APIRequestContext, baseURL: string) {
  const csrf = `e2e-csrf-${Date.now()}`;
  const session = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const headers = { cookie: `__Host-csrf=${csrf}; ${session}` };
  return {
    save: (url: string, collection?: "planning") => request.post("/api/place-import", {
      headers: { ...headers, origin: new URL(baseURL).origin, "sec-fetch-site": "same-origin",
        "content-type": "application/json", "x-csrf-token": csrf },
      data: collection ? { url, collection } : { url },
    }),
    list: () => request.get("/api/place-import", { headers }),
  };
}
const instagram = () => `https://www.instagram.com/p/e2e${randomBytes(4).toString("hex")}/`;

test("a link with no provider says why it needs input, and re-saving it reuses the row in a second collection", async ({ context, request, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const me = await signInAsMember(context, baseURL!, `Saver ${Date.now()}`);
  const { save, list } = await saver(context, request, baseURL!);
  const admin = localAdmin();
  const url = instagram();

  const first = await save(url);
  expect(first.status(), await first.text()).toBe(200);
  const { id } = await first.json() as { id: string };
  const { data: row } = await admin.from("place_imports").select("person_id,provider,status,extracted_data").eq("id", id).single();
  expect([row!.person_id, row!.provider, row!.status]).toEqual([me.userId, "instagram", "needs_input"]);
  expect((row!.extracted_data as { reason?: string }).reason).toBe("unsupported_provider");

  const again = await save(url, "planning");
  expect(again.status()).toBe(200);
  expect((await again.json() as { id: string }).id).toBe(id); // the same row, not a second one
  const { data: items } = await admin.from("place_collection_items").select("place_collections(kind)").eq("import_id", id);
  expect(items!.map((i) => (i.place_collections as unknown as { kind: string }).kind).sort()).toEqual(["planning", "want_to_try"]);
  const { data: after } = await admin.from("place_imports").select("status").eq("id", id).single();
  expect(after!.status).toBe("needs_input"); // a re-save never resets it to pending

  const listed = await list();
  expect(listed.status()).toBe(200);
  expect((await listed.json() as { saved: { id: string }[] }).saved.map((s) => s.id)).toContain(id);
});

test("two first saves of one link at once make one row and one collection item", async ({ context, request, baseURL }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  const me = await signInAsMember(context, baseURL!, `Racer ${Date.now()}`);
  const { save } = await saver(context, request, baseURL!);
  const url = instagram();

  const [a, b] = await Promise.all([save(url), save(url)]);
  expect([a.status(), b.status()]).toEqual([200, 200]);
  const [idA, idB] = [(await a.json() as { id: string }).id, (await b.json() as { id: string }).id];
  expect(idA).toBe(idB);
  const admin = localAdmin();
  const { data: rows } = await admin.from("place_imports").select("id").eq("person_id", me.userId);
  expect(rows).toHaveLength(1);
  const { count } = await admin.from("place_collection_items").select("import_id", { count: "exact", head: true }).eq("import_id", idA);
  expect(count).toBe(1);
});
