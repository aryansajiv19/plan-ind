import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { firstPhotoRef, parsePhotoUri } from "../lib/places/client.ts";
import { eligiblePlaceId, parseSpotId, resolvePlacePhoto } from "../lib/places/photo.ts";
import { googleMapsPlaceUrl } from "../lib/places/maps-url.ts";

const KEY = "AIzaFixtureKey_photo_0123456789";
const PLACE = "ChIJbuQtairFixture0000001";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/places/${name}`, import.meta.url), "utf8");

test("the route accepts a spot id and nothing else", () => {
  assert.equal(parseSpotId("A0000000-0000-0000-0000-000000000004"), "a0000000-0000-0000-0000-000000000004");
  for (const bad of ["", "ChIJbuQtairFixture0000001", "places/x/photos/y", "a0000000-0000-0000-0000-00000000000", "a0000000-0000-0000-0000-000000000004/../x", "a0000000-0000-0000-0000-000000000004%00"]) {
    assert.equal(parseSpotId(bad), null, bad);
  }
});

test("only a curated spot with a valid place id and no photo of its own may spend a photo call", () => {
  const row = { id: "a", source: "curated", photo_url: null, google_place_id: PLACE };
  assert.equal(eligiblePlaceId(row), PLACE);
  assert.equal(eligiblePlaceId(null), null, "unreadable under RLS / missing");
  assert.equal(eligiblePlaceId({ ...row, source: "custom" }), null);
  assert.equal(eligiblePlaceId({ ...row, photo_url: "https://x/spot.jpg" }), null);
  assert.equal(eligiblePlaceId({ ...row, google_place_id: null }), null);
  assert.equal(eligiblePlaceId({ ...row, google_place_id: "../../v1/places:searchText" }), null);
});

test("a photo name is used only if it belongs to the place we asked about", () => {
  const details = JSON.parse(fixture("place-details-photos.json"));
  const ref = firstPhotoRef(details, PLACE);
  assert.equal(ref?.name, `places/${PLACE}/photos/AWn5SU0xYz_Q-fixture0`);
  assert.deepEqual(ref?.attributions, [{ displayName: "Fixture Author", uri: "https://maps.google.com/maps/contrib/100000000000000000001" }]);
  assert.equal(firstPhotoRef(details, "ChIJotherPlace000000000001"), null);
  assert.equal(firstPhotoRef({ photos: [{ name: `places/${PLACE}/photos/../../x` }] }, PLACE), null);
});

test("photoUri must be an exact Google photo host over https", () => {
  assert.equal(parsePhotoUri(JSON.parse(fixture("photo-media.json"))), "https://lh3.googleusercontent.com/place-photos/AJnk2cFixture=s4800-w800");
  for (const uri of [
    "http://lh3.googleusercontent.com/x",
    "https://lh3.googleusercontent.com.evil.example/x",
    "https://evil.example/lh3.googleusercontent.com",
    "https://user:pw@lh3.googleusercontent.com/x",
    "javascript:alert(1)",
  ]) assert.equal(parsePhotoUri({ photoUri: uri }), null, uri);
});

function fakeGoogle(responses: Record<string, string>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: init?.headers as Record<string, string> });
    const hit = Object.entries(responses).find(([suffix]) => url.includes(suffix));
    return new Response(hit ? hit[1] : "{}", { status: hit ? 200 : 404, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, impl };
}

test("resolvePlacePhoto: details then media, key only in headers, attributions carried through", async () => {
  const google = fakeGoogle({ [`/v1/places/${PLACE}/photos/`]: fixture("photo-media.json"), [`/v1/places/${PLACE}`]: fixture("place-details-photos.json") });
  const photo = await resolvePlacePhoto(PLACE, KEY, { fetchImpl: google.impl });
  assert.deepEqual(photo, {
    photoUri: "https://lh3.googleusercontent.com/place-photos/AJnk2cFixture=s4800-w800",
    widthPx: 4032, heightPx: 3024,
    attributions: [{ displayName: "Fixture Author", uri: "https://maps.google.com/maps/contrib/100000000000000000001" }],
  });
  assert.equal(google.calls.length, 2);
  for (const call of google.calls) {
    assert.ok(!call.url.includes(KEY) && !call.url.includes("key="));
    assert.equal(call.headers["X-Goog-Api-Key"], KEY);
  }
  assert.ok(google.calls[1].url.endsWith("/media?maxWidthPx=800&skipHttpRedirect=true"));
});

test("resolvePlacePhoto: no photos is null (a 404), a hostile media answer is null, a Google error throws", async () => {
  assert.equal(await resolvePlacePhoto(PLACE, KEY, { fetchImpl: fakeGoogle({ [`/v1/places/${PLACE}`]: "{}" }).impl }), null);
  const hostile = fakeGoogle({
    [`/v1/places/${PLACE}/photos/`]: JSON.stringify({ photoUri: "https://evil.example/pixel.gif" }),
    [`/v1/places/${PLACE}`]: fixture("place-details-photos.json"),
  });
  assert.equal(await resolvePlacePhoto(PLACE, KEY, { fetchImpl: hostile.impl }), null);
  const denied = (async () => new Response(fixture("error-permission-denied.json"), { status: 403 })) as typeof fetch;
  await assert.rejects(resolvePlacePhoto(PLACE, KEY, { fetchImpl: denied }), /HTTP 403 PERMISSION_DENIED/);
});

test("a Maps link is built from the stored id, with no key and no stored Google URL", () => {
  assert.equal(googleMapsPlaceUrl("Bu Qtair", PLACE), `https://www.google.com/maps/search/?api=1&query=Bu+Qtair&query_place_id=${PLACE}`);
  assert.equal(googleMapsPlaceUrl("x", null), null);
  assert.equal(googleMapsPlaceUrl("x", "not a place id"), null);
});
