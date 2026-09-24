import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTextSearch, TEXT_SEARCH_FIELD_MASK } from "../lib/places/client.ts";
import { estimateCost, planFromReview, resolveOgImage, runBackfill, sniffImage, type BackfillDeps, type BackfillSpot } from "../lib/places/backfill.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/places/${name}`, import.meta.url), "utf8");
const spots = JSON.parse(fixture("spots.json")) as BackfillSpot[];
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const BY_NAME: Record<string, string> = {
  "Bu Qtair": "text-search-bu-qtair.json",
  "Tresind Studio": "text-search-tresind.json",
  "Black Tap": "text-search-black-tap.json",
  Saffron: "text-search-saffron.json",
};

function deps(overrides: Partial<BackfillDeps> = {}) {
  const saved = new Map<string, Uint8Array>();
  const sleeps: number[] = [];
  const searched: string[] = [];
  const base: BackfillDeps = {
    searchText: async (spot) => {
      searched.push(spot.name);
      if (spot.name === "Hummingbird") throw new Error("Places API HTTP 429 RESOURCE_EXHAUSTED.");
      return parseTextSearch(JSON.parse(fixture(BY_NAME[spot.name] ?? "text-search-empty.json")));
    },
    fetchOgImage: async (url) => (url.includes("tresind") ? "/images/og.jpg?w=1200&amp;h=630" : null),
    downloadImage: async () => ({ bytes: JPEG, contentType: "image/jpeg" }),
    saveFile: async (name, bytes) => { saved.set(name, bytes); },
    sleep: async (ms) => { sleeps.push(ms); },
    log: () => {},
    ...overrides,
  };
  return { deps: base, saved, sleeps, searched };
}

test("a full fixture run: sequential, one search per spot, one failure does not stop the rest", async () => {
  const run = deps();
  const review = await runBackfill(spots, run.deps, { delayMs: 300, photos: true, fieldMask: TEXT_SEARCH_FIELD_MASK, now: () => new Date("2026-09-24T00:00:00Z") });
  assert.deepEqual(run.searched, spots.map((spot) => spot.name));
  assert.deepEqual(run.sleeps, [300, 300, 300, 300], "a pause between requests, not before the first");
  assert.equal(review.textSearchRequests, 5);
  assert.deepEqual(review.entries.map((entry) => [entry.spotName, entry.confidence, entry.approve]), [
    ["Bu Qtair", "high", true],
    ["Tresind Studio", "review", false],
    ["Black Tap", "review", false],
    ["Saffron", "reject", false],
    ["Hummingbird", "error", false],
  ]);
});

test("the venue's own og:image is downloaded, sniffed, and saved under a hyphen-free spot-id name", async () => {
  const run = deps();
  const review = await runBackfill(spots, run.deps, { delayMs: 0, photos: true, fieldMask: TEXT_SEARCH_FIELD_MASK });
  const tresind = review.entries.find((entry) => entry.spotName === "Tresind Studio")!;
  assert.equal(tresind.photo.status, "saved");
  assert.equal(tresind.photo.file, "a0000000000000000000000000000005.jpg");
  assert.equal(tresind.photo.imageUrl, "https://www.tresindstudio.com/images/og.jpg?w=1200&h=630");
  assert.equal(tresind.photo.approve, false, "the photo of an unapproved match is not pre-approved");
  assert.deepEqual([...run.saved.keys()], ["a0000000000000000000000000000005.jpg"]);
  // No website: the Google-photo fallback applies, nothing downloaded.
  assert.equal(review.entries[0].photo.status, "skipped");
  // Rejected matches never trigger a fetch of anyone's site.
  assert.equal(review.entries[3].photo.detail, "no accepted match");
});

test("bytes that are not a JPEG/PNG/WebP are refused whatever the content-type said", async () => {
  const run = deps({ downloadImage: async () => ({ bytes: new TextEncoder().encode("<svg onload=alert(1)>"), contentType: "image/jpeg" }) });
  const review = await runBackfill(spots.slice(1, 2), run.deps, { delayMs: 0, photos: true, fieldMask: "" });
  assert.equal(review.entries[0].photo.status, "failed");
  assert.equal(run.saved.size, 0);
  assert.equal(sniffImage(JPEG), "image/jpeg");
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
});

test("og:image resolution rejects non-http schemes", () => {
  assert.equal(resolveOgImage("javascript:alert(1)", "https://a.example/"), null);
  assert.equal(resolveOgImage("//cdn.example/x.jpg", "https://a.example/"), "https://cdn.example/x.jpg");
});

test("review -> plan round trip: flipping one approval is the only way a review entry reaches SQL", async () => {
  const review = await runBackfill(spots, deps().deps, { delayMs: 0, photos: true, fieldMask: "" });
  assert.deepEqual(planFromReview(review).placeIds.map((row) => row.placeId), ["ChIJbuQtairFixture0000001"]);
  const tresind = review.entries.find((entry) => entry.spotName === "Tresind Studio")!;
  tresind.approve = true;
  tresind.photo.approve = true;
  const plan = planFromReview(JSON.parse(JSON.stringify(review)));
  assert.deepEqual(plan.placeIds.map((row) => row.placeId), ["ChIJbuQtairFixture0000001", "ChIJtresindStudioFixture01"]);
  assert.deepEqual(plan.photos.map((row) => row.file), ["a0000000000000000000000000000005.jpg"]);
});

test("cost: 82 curated spots are 82 Enterprise Text Search requests, $0 in the free tier, $2.87 beyond it", () => {
  const estimate = estimateCost(82);
  assert.equal(estimate.requests, 82);
  assert.equal(estimate.withinFreeTierUsd, 0);
  assert.equal(estimate.worstCaseUsd, 2.87);
});

test("image downloads keep safe-fetch's SSRF guard and refuse, rather than truncate, an oversized image", async () => {
  const { readBytes, safeFetchImage } = await import("../lib/place-import/safe-fetch.ts");
  await assert.rejects(safeFetchImage("http://127.0.0.1:9/og.jpg"), /won't fetch/);
  const body = (size: number) => new Response(new Uint8Array(size));
  assert.equal((await readBytes(body(1024), 1024))?.byteLength, 1024);
  assert.equal(await readBytes(body(1025), 1024), null);
});

test("a key that fails every request stops the run after three, instead of trying all 82", async () => {
  const run = deps({ searchText: async () => { throw new Error("Places API HTTP 403 PERMISSION_DENIED."); } });
  const review = await runBackfill(spots, run.deps, { delayMs: 0, photos: false, fieldMask: "" });
  assert.equal(review.textSearchRequests, 3);
  assert.deepEqual(review.entries.map((entry) => entry.confidence), ["error", "error", "error"]);
});
