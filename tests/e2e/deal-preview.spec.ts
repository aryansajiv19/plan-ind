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
