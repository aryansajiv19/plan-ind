import assert from "node:assert/strict";
import test from "node:test";
import { canOptimiseImage, spotPhotoHost } from "../lib/image-src.ts";

const SUPABASE = "https://fixtureref.supabase.co";
const PHOTO = `${SUPABASE}/storage/v1/object/public/spot-photos/abc123.jpg`;

test("only our own public spot-photos bucket over https is optimised", () => {
  assert.equal(canOptimiseImage(PHOTO, SUPABASE), true);
  for (const src of [
    "https://places.googleapis.com/v1/places/x/photos/y/media?maxWidthPx=800",
    "https://lh3.googleusercontent.com/place-photos/abc=s1600",
    PHOTO.replace("https:", "http:"),
    `${SUPABASE}/storage/v1/object/public/avatars/abc123.jpg`,
    `${SUPABASE}/storage/v1/object/sign/spot-photos/abc123.jpg`,
    `${SUPABASE}/storage/v1/object/public/spot-photos/../avatars/x.jpg`,
    `${SUPABASE}:8443/storage/v1/object/public/spot-photos/abc123.jpg`,
    "https://evil.example/storage/v1/object/public/spot-photos/abc123.jpg",
    "http://127.0.0.1:54321/storage/v1/object/public/spot-photos/abc123.jpg",
    "https://192.168.1.5/storage/v1/object/public/spot-photos/abc123.jpg",
    "data:image/png;base64,AAAA",
    "not a url",
  ]) {
    assert.equal(canOptimiseImage(src, SUPABASE), false, src);
  }
});

test("a missing or non-https Supabase URL allows nothing", () => {
  assert.equal(spotPhotoHost(undefined), null);
  for (const base of ["", "not a url", "http://127.0.0.1:54321", "https://fixtureref.supabase.co:8443"]) {
    assert.equal(spotPhotoHost(base), null, base);
    assert.equal(canOptimiseImage(PHOTO, base), false, base);
  }
  assert.equal(spotPhotoHost(SUPABASE), "fixtureref.supabase.co");
});
