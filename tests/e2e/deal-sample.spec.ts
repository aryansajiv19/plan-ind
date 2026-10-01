import { test, expect } from "@playwright/test";

// P8: GET /api/spots/deal/sample -- the signed-out "Preview the deal": nine
// real cards for the visitor's settings, at the strictest age gate, writing
// nothing. Runs signed out on purpose.
const FOOD = ["dinner", "cafe", "brunch", "dessert", "shisha"];
const ADULT_ONLY = ["nightlife", "vibes", "beach_club", "shisha"]; // 18+/21+ categories

test("a signed-out visitor gets nine real cards from the category they picked", async ({ request }) => {
  const res = await request.get("/api/spots/deal/sample?category=dinner&origin=anywhere");
  expect(res.status()).toBe(200);
  const body = await res.json() as { cards: { id: string; name: string; area: string; category: string }[] | null; reason?: string };
  expect(body.cards, `no cards: ${body.reason}`).not.toBeNull();
  expect(body.cards!).toHaveLength(9);
  expect(new Set(body.cards!.map((c) => c.id)).size).toBe(9);
  for (const card of body.cards!) expect(FOOD).toContain(card.category);
});

test("an age-gated category never shows an adults-only place to a visitor of unknown age", async ({ request }) => {
  const res = await request.get("/api/spots/deal/sample?category=nightlife&origin=anywhere");
  expect(res.status()).toBe(200);
  const body = await res.json() as { cards: { category: string }[] | null; reason?: string };
  if (body.cards === null) expect(body.reason).toBe("tooFew"); // honest: the client falls back and says so
  else for (const card of body.cards) expect(ADULT_ONLY).not.toContain(card.category);
});

test("an unknown category is a 400", async ({ request }) => {
  expect((await request.get("/api/spots/deal/sample?category=nope")).status()).toBe(400);
});

// Owner (2026-10-01): a curated place with no real photo is never dealt.
// supabase/seed.sql holds the fixture: 5 water spots with a photo and 3
// without (e2e00000-...0006 to 0008), so with the 4 seeded beaches the beach
// family has exactly nine dealable places. Seeded rather than inserted here
// because the deal pool is cached for an hour (a second project or a retry
// would never see a spec's inserts). All five must be dealt, the positive
// control; without the rule twelve qualify and a deal with none of the three
// photo-less ones is a 1-in-220 fluke.
const fixture = (n: number) => `e2e00000-0000-0000-0000-00000000000${n}`;

test("a curated place with no photo is never dealt; places with one are", async ({ request }) => {
  const res = await request.get("/api/spots/deal/sample?category=water&origin=anywhere");
  expect(res.status()).toBe(200);
  const body = await res.json() as { cards: { id: string }[] | null; reason?: string };
  expect(body.cards, `no cards: ${body.reason}`).not.toBeNull();
  const dealt = new Set(body.cards!.map((c) => c.id));
  for (const n of [1, 2, 3, 4, 5]) expect(dealt.has(fixture(n)), `${fixture(n)} has a photo and should be dealt`).toBe(true);
  for (const n of [6, 7, 8]) expect(dealt.has(fixture(n)), `${fixture(n)} has no photo and was dealt`).toBe(false);
});
