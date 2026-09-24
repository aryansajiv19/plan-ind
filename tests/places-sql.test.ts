import assert from "node:assert/strict";
import test from "node:test";
import { planFromReview, type ReviewFile } from "../lib/places/backfill.ts";
import {
  nextMigrationNumber,
  photoFileName,
  photoMigration,
  placeIdMigration,
  sqlComment,
  sqlLiteral,
  storageBase,
} from "../lib/places/sql.ts";

const AT = "2026-09-24T00:00:00.000Z";

test("sqlLiteral doubles quotes and refuses NUL", () => {
  assert.equal(sqlLiteral("O'Beach"), "'O''Beach'");
  assert.equal(sqlLiteral("a''b"), "'a''''b'");
  assert.throws(() => sqlLiteral("a\u0000b"));
});

test("a newline in a venue name cannot end the comment and become SQL", () => {
  const hostile = "Nice Place\ndrop table spots; --\r\u2028*/ select 1 /*";
  const comment = sqlComment(hostile);
  assert.ok(!/[\r\n\u2028]/.test(comment));
  assert.ok(!comment.includes("*/") && !comment.includes("/*"));
  const sql = placeIdMigration(64, [{ spotId: "a0000000-0000-0000-0000-000000000004", spotName: hostile, placeId: "ChIJbuQtairFixture0000001" }], AT);
  const statements = sql.split("\n").filter((line) => line && !line.startsWith("--"));
  assert.deepEqual(statements, [
    "begin;",
    "update public.spots set google_place_id = 'ChIJbuQtairFixture0000001', places_synced_at = now()",
    "  where id = 'a0000000-0000-0000-0000-000000000004' and source = 'curated' and google_place_id is null;",
    "commit;",
  ]);
  assert.ok(sql.startsWith("-- Migration 064: "));
});

test("values that are not ids are refused, not escaped", () => {
  assert.throws(() => placeIdMigration(64, [{ spotId: "a0000000-0000-0000-0000-000000000004", spotName: "x", placeId: "abc'); drop table spots;--" }], AT), /Not a place id/);
  assert.throws(() => placeIdMigration(64, [{ spotId: "1 or 1=1", spotName: "x", placeId: "ChIJbuQtairFixture0000001" }], AT), /Not a spot id/);
});

test("two spots claiming one place is refused before it can abort a live migration", () => {
  assert.throws(() => placeIdMigration(64, [
    { spotId: "20000000-0000-0000-0000-000000000003", spotName: "Black Tap", placeId: "ChIJblackTapJBRFixture001" },
    { spotId: "20000000-0000-0000-0000-000000000004", spotName: "Black Tap 2", placeId: "ChIJblackTapJBRFixture001" },
  ], AT), /same place/);
});

test("photo migration: hyphen-free file names under the public bucket, only filling nulls", () => {
  assert.equal(photoFileName("A0000000-0000-0000-0000-000000000005", "image/webp"), "a0000000000000000000000000000005.webp");
  const base = storageBase("https://zyojaoyatunjwgbivaqu.supabase.co");
  const sql = photoMigration(65, [{ spotId: "a0000000-0000-0000-0000-000000000005", spotName: "Tresind Studio", file: "a0000000000000000000000000000005.jpg", sourcePage: "https://www.tresindstudio.com/" }], base, AT);
  assert.ok(sql.includes("photo_url = 'https://zyojaoyatunjwgbivaqu.supabase.co/storage/v1/object/public/spot-photos/a0000000000000000000000000000005.jpg', photo_source = 'venue_site', photo_attribution = null"));
  assert.ok(sql.includes("where id = 'a0000000-0000-0000-0000-000000000005' and source = 'curated' and photo_url is null;"));
  // A file that does not belong to the spot it is attached to is refused.
  assert.throws(() => photoMigration(65, [{ spotId: "a0000000-0000-0000-0000-000000000005", spotName: "x", file: "b0000000000000000000000000000005.jpg", sourcePage: "" }], base, AT));
  assert.throws(() => storageBase("http://evil.example.com"));
});

test("the next migration number is max + 1, never a reused gap", () => {
  assert.equal(nextMigrationNumber(["migration-045-x.sql", "migration-047-y.sql", "migration-062-z.sql", "schema.sql"]), 63);
  assert.equal(nextMigrationNumber(["migration-063-google-place-ids.sql"]), 64);
  assert.equal(nextMigrationNumber([]), 63);
});

test("only entries explicitly approved with `true` reach SQL, and a photo needs its place approved too", () => {
  const place = (id: string) => ({ id, displayName: "x", formattedAddress: null, location: null, googleMapsUri: null, websiteUri: null, rating: null, userRatingCount: null, priceLevel: null, weekdayDescriptions: null, photoCount: 0 });
  const entry = (spotId: string, approve: unknown, photoApprove: unknown) => ({
    spotId, spotName: spotId, area: "", category: "", approve, confidence: "high", nameScore: 1, distanceKm: 0, distanceFrom: "spot", reasons: [],
    place: place(`ChIJ${spotId.replace(/-/g, "").slice(0, 20)}`),
    photo: { status: "saved", approve: photoApprove, file: `${spotId.replace(/-/g, "")}.jpg`, sourcePage: "https://example.com/" },
  });
  const review = { generatedAt: AT, fieldMask: "", textSearchRequests: 3, estimate: { requests: 3, withinFreeTierUsd: 0, worstCaseUsd: 0.11, note: "" }, entries: [
    entry("a0000000-0000-0000-0000-000000000001", true, true),
    entry("a0000000-0000-0000-0000-000000000002", "true", true),
    entry("a0000000-0000-0000-0000-000000000003", false, true),
    entry("a0000000-0000-0000-0000-000000000004", true, false),
  ] } as unknown as ReviewFile;
  const plan = planFromReview(review);
  assert.deepEqual(plan.placeIds.map((row) => row.spotId), ["a0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000004"]);
  assert.deepEqual(plan.photos.map((row) => row.spotId), ["a0000000-0000-0000-0000-000000000001"]);
});
