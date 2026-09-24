import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  assertSafeBaseUrl,
  buildPhotoDetailsRequest,
  buildPhotoMediaRequest,
  buildTextSearchRequest,
  parseTextSearch,
  placesFetchJson,
  redactKey,
  TEXT_SEARCH_FIELD_MASK,
} from "../lib/places/client.ts";

const KEY = "AIzaFixtureKey_do-not-log_0123456789";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/places/${name}`, import.meta.url), "utf8");

// If this list changes, the SKU (and the bill) may change with it. Update
// the cost note in docs/PLACES_INGESTION_SCOPE.md in the same commit.
test("the Text Search field mask is exactly the reviewed Enterprise set, with no Atmosphere field", () => {
  assert.deepEqual(TEXT_SEARCH_FIELD_MASK.split(","), [
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.googleMapsUri", "places.websiteUri", "places.rating", "places.userRatingCount",
    "places.priceLevel", "places.regularOpeningHours", "places.photos",
  ]);
  for (const atmosphere of ["reviews", "editorialSummary", "servesBeer", "outdoorSeating", "*"]) {
    assert.ok(!TEXT_SEARCH_FIELD_MASK.includes(atmosphere), `${atmosphere} would reprice every call`);
  }
});

test("text search sends the key only in X-Goog-Api-Key, biased to Dubai", () => {
  const request = buildTextSearchRequest({ name: "Bu Qtair", area: "Umm Suqeim" }, KEY);
  assert.equal(request.url, "https://places.googleapis.com/v1/places:searchText");
  assert.ok(!request.url.includes(KEY));
  assert.ok(!request.init.body!.includes(KEY));
  assert.equal(request.init.headers["X-Goog-Api-Key"], KEY);
  assert.equal(request.init.headers["X-Goog-FieldMask"], TEXT_SEARCH_FIELD_MASK);
  const body = JSON.parse(request.init.body!);
  assert.equal(body.textQuery, "Bu Qtair, Umm Suqeim, Dubai");
  assert.equal(body.regionCode, "AE");
  assert.deepEqual(body.locationBias.circle.center, { latitude: 25.2048, longitude: 55.2708 });
});

test("photo requests keep the key out of the URL and refuse ids that could steer the path", () => {
  const details = buildPhotoDetailsRequest("ChIJbuQtairFixture0000001", KEY);
  assert.equal(details.url, "https://places.googleapis.com/v1/places/ChIJbuQtairFixture0000001");
  assert.equal(details.init.headers["X-Goog-FieldMask"], "photos");
  const media = buildPhotoMediaRequest("ChIJbuQtairFixture0000001", "places/ChIJbuQtairFixture0000001/photos/AWn5SU0xYz_Q-fixture0", KEY);
  assert.equal(media.url, "https://places.googleapis.com/v1/places/ChIJbuQtairFixture0000001/photos/AWn5SU0xYz_Q-fixture0/media?maxWidthPx=800&skipHttpRedirect=true");
  for (const request of [details, media]) {
    assert.ok(!request.url.includes(KEY) && !request.url.includes("key="));
    assert.equal(request.init.headers["X-Goog-Api-Key"], KEY);
  }
  assert.throws(() => buildPhotoDetailsRequest("../../v1/other", KEY));
  assert.throws(() => buildPhotoDetailsRequest("ChIJbuQtairFixture0000001?x=", KEY));
  // A photo name that belongs to a different place is refused.
  assert.throws(() => buildPhotoMediaRequest("ChIJbuQtairFixture0000001", "places/ChIJotherPlace000000000001/photos/abc", KEY));
  assert.throws(() => buildPhotoMediaRequest("ChIJbuQtairFixture0000001", "places/ChIJbuQtairFixture0000001/photos/../x", KEY));
});

test("the key is never sent in cleartext or to a host we did not choose", () => {
  assert.equal(assertSafeBaseUrl("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(assertSafeBaseUrl("https://places.googleapis.com/"), "https://places.googleapis.com");
  assert.throws(() => assertSafeBaseUrl("http://places.googleapis.com"));
  assert.throws(() => assertSafeBaseUrl("https://evil.example.com"));
  assert.throws(() => buildTextSearchRequest({ name: "x", area: "y" }, ""), /key is required/);
});

test("redactKey scrubs a key a server echoed back", () => {
  assert.equal(redactKey(`bad key ${KEY} here ${KEY}`, KEY), "bad key [redacted] here [redacted]");
});

test("recorded Text Search responses parse into only the fields we read", () => {
  const [place] = parseTextSearch(JSON.parse(fixture("text-search-tresind.json")));
  assert.equal(place.id, "ChIJtresindStudioFixture01");
  assert.equal(place.displayName, "Tresind Studio");
  assert.equal(place.websiteUri, "https://www.tresindstudio.com/");
  assert.deepEqual(place.location, { latitude: 25.2128, longitude: 55.2811 });
  assert.equal(place.weekdayDescriptions?.length, 7);
  assert.deepEqual(parseTextSearch(JSON.parse(fixture("text-search-empty.json"))), []);
  // A result with an id that could not be a place id is dropped, not trusted.
  assert.deepEqual(parseTextSearch({ places: [{ id: "x'; drop table spots;--", displayName: { text: "Evil" } }] }), []);
});

// Over real loopback HTTP: what actually goes on the wire.
async function withServer(
  handler: (headers: IncomingHttpHeaders, url: string, reply: (status: number, body: string) => void) => void,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => handler(req.headers, req.url ?? "", (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(body);
  }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("on the wire: key in the header, never the URL; errors come back redacted", async () => {
  const seen: { url: string; key: unknown; mask: unknown }[] = [];
  await withServer((headers, url, reply) => {
    seen.push({ url, key: headers["x-goog-api-key"], mask: headers["x-goog-fieldmask"] });
    if (headers["x-goog-api-key"] === "echo-me-key-000") return reply(403, JSON.stringify({ error: { status: "PERMISSION_DENIED echo-me-key-000" } }));
    reply(200, fixture("text-search-bu-qtair.json"));
  }, async (base) => {
    const body = await placesFetchJson(buildTextSearchRequest({ name: "Bu Qtair", area: "Umm Suqeim" }, KEY, base), KEY);
    assert.equal(parseTextSearch(body)[0].id, "ChIJbuQtairFixture0000001");
    await assert.rejects(
      placesFetchJson(buildTextSearchRequest({ name: "x", area: "y" }, "echo-me-key-000", base), "echo-me-key-000"),
      (error: Error) => error.message.includes("HTTP 403") && !error.message.includes("echo-me-key-000"),
    );
  });
  assert.equal(seen[0].url, "/v1/places:searchText");
  assert.equal(seen[0].key, KEY);
  assert.equal(seen[0].mask, TEXT_SEARCH_FIELD_MASK);
});

test("a Places call that never answers is aborted at its deadline", async () => {
  await withServer(() => { /* never replies */ }, async (base) => {
    const started = Date.now();
    await assert.rejects(
      placesFetchJson(buildPhotoDetailsRequest("ChIJbuQtairFixture0000001", KEY, base), KEY, fetch, 150),
      /timed out/,
    );
    assert.ok(Date.now() - started < 2_000);
  });
});
