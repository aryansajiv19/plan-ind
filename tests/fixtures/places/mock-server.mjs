// Loopback stand-in for places.googleapis.com, serving the recorded fixtures
// in this directory. For proving scripts/places-backfill.ts end to end
// without a key or network:
//
//   node tests/fixtures/places/mock-server.mjs 8787 &
//   GOOGLE_PLACES_API_KEY=fixture-key node --import ./tests/register-aliases.mjs \
//     scripts/places-backfill.ts --base-url http://127.0.0.1:8787 \
//     --spots tests/fixtures/places/spots.json --review /tmp/review.json --no-photos
//
// It enforces the same contract the real API does on the parts we care
// about: the key must arrive in X-Goog-Api-Key (a ?key= in the URL is
// refused), and searchText requires a field mask. The key "invalid-key"
// gets Google's 403 PERMISSION_DENIED body. Requests are logged WITHOUT
// the key.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const fixture = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const BY_QUERY = [
  [/^Bu Qtair,/, "text-search-bu-qtair.json"],
  [/^Tresind Studio,/, "text-search-tresind.json"],
  [/^Black Tap,/, "text-search-black-tap.json"],
  [/^Saffron,/, "text-search-saffron.json"],
];

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const key = req.headers["x-goog-api-key"];
  console.log(`${req.method} ${url.pathname}${url.search} mask=${req.headers["x-goog-fieldmask"] ?? "-"} key=${key ? "header" : "MISSING"}`);
  if (url.searchParams.has("key")) return send(res, 400, JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "key in URL refused by fixture server" } }));
  if (!key) return send(res, 403, fixture("error-permission-denied.json"));
  if (key === "invalid-key") return send(res, 403, fixture("error-permission-denied.json"));

  if (req.method === "POST" && url.pathname === "/v1/places:searchText") {
    if (!req.headers["x-goog-fieldmask"]) return send(res, 400, JSON.stringify({ error: { code: 400, status: "INVALID_ARGUMENT", message: "FieldMask is a required parameter" } }));
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const { textQuery = "" } = JSON.parse(raw || "{}");
      const hit = BY_QUERY.find(([pattern]) => pattern.test(textQuery));
      send(res, 200, fixture(hit ? hit[1] : "text-search-empty.json"));
    });
    return;
  }
  if (req.method === "GET" && /^\/v1\/places\/[A-Za-z0-9_-]+$/.test(url.pathname)) return send(res, 200, fixture("place-details-photos.json"));
  if (req.method === "GET" && /^\/v1\/places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+\/media$/.test(url.pathname)) return send(res, 200, fixture("photo-media.json"));
  send(res, 404, JSON.stringify({ error: { code: 404, status: "NOT_FOUND" } }));
});

server.listen(Number(process.argv[2] ?? 8787), "127.0.0.1", () => {
  console.log(`places fixture server on http://127.0.0.1:${server.address().port} (pid ${process.pid})`);
});
