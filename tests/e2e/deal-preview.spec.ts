import { test, expect } from "@playwright/test";
import { signInAsMember } from "./local-stack";
import { canProvision } from "./plan-factory";

// P6: GET /api/spots/deal/preview -- counts per budget x radius for the
// composer, and the most each category could offer this viewer. Read-only.
// The age cases live in the unit tests (eligibleCount); this pins the HTTP
// contract on a real build against the local stack's catalogue.

test("signed out, the deal preview is refused", async ({ request }) => {
  const res = await request.get("/api/spots/deal/preview?category=dinner&origin=anywhere");
  expect(res.status()).toBe(401);
});

test("signed in, it counts every budget and radius option and every category", async ({ context, baseURL, page }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await signInAsMember(context, baseURL!, "Preview");
  const res = await page.request.get("/api/spots/deal/preview?category=dinner&origin=marina");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const body = await res.json() as {
    category: string; origin: string;
    counts: { maxBudget: number | null; radii: { radiusKm: number | null; count: number }[] }[];
    categories: Record<string, number | null>;
  };
  expect(body.category).toBe("dinner");
  expect(body.counts.map((b) => b.maxBudget)).toEqual([null, 100, 200, 350, 500]);
  for (const b of body.counts) expect(b.radii.map((r) => r.radiusKm)).toEqual([10, 20, 35, null]);

  // Tighter never means more: a cap of AED 100 can't offer more than any budget,
  // and 10 km can't offer more than anywhere.
  const cell = (budget: number | null, radius: number | null) =>
    body.counts.find((b) => b.maxBudget === budget)!.radii.find((r) => r.radiusKm === radius)!.count;
  expect(cell(100, null)).toBeLessThanOrEqual(cell(null, null));
  expect(cell(null, 10)).toBeLessThanOrEqual(cell(null, null));
  expect(cell(null, null)).toBeGreaterThan(0);
  expect(body.categories.dinner).toBe(cell(null, null)); // anywhere, any budget
  expect(typeof body.categories.nightlife).toBe("number");
});

test("an unknown category or area is a 400, not a guess", async ({ context, baseURL, page }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await signInAsMember(context, baseURL!, "Preview");
  expect((await page.request.get("/api/spots/deal/preview?category=nope")).status()).toBe(400);
  expect((await page.request.get("/api/spots/deal/preview?category=dinner&origin=mars")).status()).toBe(400);
});

// P26: POST /api/spots/deal returns cards alongside ids, same order.
test("a deal returns its cards, one per id and in the same order", async ({ context, baseURL, request }) => {
  test.skip(!canProvision(), "needs the local stack to mint an account");
  await signInAsMember(context, baseURL!, "Dealer");
  // The route's double-submit CSRF check, as the app's own fetch does it. A
  // __Host- cookie can't be set on http through the browser context, so the
  // request (no cookie jar of its own) carries the session and CSRF cookies
  // in one explicit Cookie header -- the load harness's approach.
  const csrf = "e2e-csrf-" + Date.now();
  const session = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await request.post("/api/spots/deal", {
    headers: {
      origin: new URL(baseURL!).origin, "sec-fetch-site": "same-origin", "content-type": "application/json",
      "x-csrf-token": csrf, cookie: `__Host-csrf=${csrf}; ${session}`,
    },
    data: { category: "dinner", count: 3 },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json() as {
    ids: string[] | null;
    cards?: { id: string; name: string; area: string; min_spend: number; photo_url: string | null; photo_attribution: string | null }[];
  };
  expect(body.ids).toHaveLength(3);
  expect(body.cards!.map((c) => c.id)).toEqual(body.ids);
  for (const card of body.cards!) {
    expect(card.name.length).toBeGreaterThan(0);
    expect(typeof card.min_spend).toBe("number");
    expect(card).toHaveProperty("photo_attribution"); // the credit travels with the photo, even when null
  }
});
