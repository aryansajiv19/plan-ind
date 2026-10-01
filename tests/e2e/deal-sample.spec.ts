import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { canProvision } from "./plan-factory";
import { localAdmin } from "./local-stack";

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

// Owner (2026-10-01): a curated place with no real photo is never dealt. The
// beach family is asked for by no other spec or demo deck, so its cached pool
// is first read here, after the inserts. 4 seeded beaches + 5 water spots with
// photos are exactly nine, so all five must come back (the positive control:
// proves the pool saw the inserts); without the rule 14 qualify and a deal
// with none of the five photo-less ones would be a 1-in-2,002 fluke.
test("a curated place with no photo is never dealt; places with one are", async ({ request }) => {
  test.skip(!canProvision(), "needs the local stack to insert spots");
  const admin = localAdmin();
  const row = (photo: boolean) => ({
    id: randomUUID(), name: `E2E water ${photo ? "photo" : "bare"} ${randomUUID().slice(0, 6)}`, category: "water", area: "JBR",
    cuisine: "Water park", price_band: "$$", min_spend: 0, open_till: "", vibe: "E2E fixture spot", source: "curated",
    photo_url: photo ? "/icon.svg" : null,
  });
  const withPhoto = Array.from({ length: 5 }, () => row(true));
  const bare = Array.from({ length: 5 }, () => row(false));
  const { error } = await admin.from("spots").insert([...withPhoto, ...bare]);
  expect(error, error?.message).toBeNull();
  try {
    const res = await request.get("/api/spots/deal/sample?category=water&origin=anywhere");
    expect(res.status()).toBe(200);
    const body = await res.json() as { cards: { id: string }[] | null; reason?: string };
    expect(body.cards, `no cards: ${body.reason}`).not.toBeNull();
    const dealt = new Set(body.cards!.map((c) => c.id));
    for (const spot of withPhoto) expect(dealt.has(spot.id), `${spot.name} has a photo and should be dealt`).toBe(true);
    for (const spot of bare) expect(dealt.has(spot.id), `${spot.name} has no photo and was dealt`).toBe(false);
  } finally {
    await admin.from("spots").delete().in("id", [...withPhoto, ...bare].map((s) => s.id));
  }
});
