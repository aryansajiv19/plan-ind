import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { SafeFetchError, pickPublicAddress, pinnedGet, readCapped, safeFetch } from "../lib/place-import/safe-fetch.ts";
import { metaContent } from "../lib/place-import/web-adapter.ts";

const MAX_BYTES = 512 * 1024;

// Builds a Response whose body arrives in several chunks, the way a real
// one does -- the cap has to hold across chunk boundaries, not just on a
// single buffer.
function streamed(parts: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
  );
}

test("a body under the cap is returned whole", async () => {
  const body = "<title>Small page</title>";
  assert.equal(await readCapped(streamed([body])), body);
});

test("a body over the cap is truncated, not rejected", async () => {
  // The metadata this pipeline wants lives in <head>; the filler after it
  // pushes the document past the cap the way a real long article does.
  const head = '<meta property="og:title" content="Museum of the Future" />';
  const text = await readCapped(streamed([head, "x".repeat(MAX_BYTES * 2)]));
  assert.ok(text.includes("Museum of the Future"), "metadata already read must survive");
  assert.equal(text.length, MAX_BYTES, "must stop exactly at the cap");
});

test("the cap holds across many chunks", async () => {
  const chunks = Array.from({ length: 40 }, () => "y".repeat(32 * 1024)); // 1.25MB
  assert.equal((await readCapped(streamed(chunks))).length, MAX_BYTES);
});

test("a tag straddling the cut degrades to no match, never a garbled value", async () => {
  // The cut lands inside the content attribute, so the closing quote never
  // arrives. Asserted through the real extractor rather than a re-declared
  // copy of its regex, so this cannot pass while web-adapter drifts.
  const filler = "z".repeat(MAX_BYTES - 40);
  const text = await readCapped(streamed([filler, '<meta property="og:title" content="Half a titl']));
  assert.equal(metaContent(text, "og:title"), null);
});

test("any value a truncated page yields also exists verbatim in the full page", () => {
  // The regexes have no anchors or lookarounds, so a match in a prefix is a
  // match at the same offset in the whole document. Truncation can change
  // WHICH tag wins (the reversed-order fallback may pick an earlier one),
  // but it can never synthesize a value the page does not contain -- that
  // distinction is what makes truncating safe.
  const full = '<meta content="First" property="og:title">'
    + `<meta property="og:title" content="${"A".repeat(64)}">`;
  const truncated = full.slice(0, 60);
  const fromTruncated = metaContent(truncated, "og:title");
  assert.ok(fromTruncated !== null);
  assert.ok(full.includes(fromTruncated), `"${fromTruncated}" must appear verbatim in the full page`);
});

test("a multi-byte character split by the cut does not throw", async () => {
  // 'é' is two bytes; cutting between them must decode to U+FFFD rather
  // than raising, or one unlucky page would 500 instead of degrading.
  const filler = "a".repeat(MAX_BYTES - 1);
  const text = await readCapped(streamed([filler, "é"]));
  assert.equal(text.length, MAX_BYTES);
});

// ── ReDoS regression ─────────────────────────────────────────────────────
// metaContent's original pattern used two unanchored `[^>]+` runs, which
// backtracked super-linearly on markup carrying many `property="og:title"`
// occurrences with no following `content=`. Measured before the fix: 30KB
// took 3.9s, 45KB took 13.7s, 536KB never finished. Because
// resolvePlaceImport is awaited inside the route handler, that was a
// synchronous spin on Node's single event loop -- a whole-process outage
// from one pasted link, not a slow request.
test("an adversarial 512KB document cannot make metaContent spin", () => {
  // The shape that triggered it: the anchor the pattern looks for, repeated,
  // never followed by the attribute that would complete a match.
  const hostile = `<meta property="og:title" `.repeat(20_000).slice(0, 512 * 1024);
  const started = performance.now();
  const result = metaContent(hostile, "og:title");
  const elapsed = performance.now() - started;
  assert.equal(result, null, "no complete tag, so no match");
  assert.ok(elapsed < 50, `took ${elapsed.toFixed(0)}ms — the pattern is backtracking again`);
});

test("a real tag past the head-scan window is not read", () => {
  // Deliberate: og: tags live in <head>. Scanning the whole body is what let
  // a 512KB input become the worst case, so the limit is a security bound,
  // not an optimisation.
  const buried = `${"x".repeat(20 * 1024)}<meta property="og:title" content="Too far in">`;
  assert.equal(metaContent(buried, "og:title"), null);
});

test("a normal document still resolves its tags", () => {
  const page = `<html><head><meta property="og:title" content="Museum of the Future">`
    + `<meta content="A place" property="og:description"></head><body>x</body></html>`;
  assert.equal(metaContent(page, "og:title"), "Museum of the Future");
  assert.equal(metaContent(page, "og:description"), "A place", "reversed attribute order still works");
});

// ── DNS rebinding ────────────────────────────────────────────────────────
// Every resolved address is checked, and the connection goes to the one that
// was checked -- never to a second resolution fetch() would have made.

test("a host is refused if ANY of its addresses is private, not only the first", () => {
  assert.throws(
    () => pickPublicAddress([{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }]),
    SafeFetchError,
  );
  assert.throws(() => pickPublicAddress([{ address: "::ffff:7f00:1", family: 6 }]), SafeFetchError);
  assert.throws(() => pickPublicAddress([]), SafeFetchError);
  // Positive control: an all-public answer is accepted, pinned to the first.
  assert.deepEqual(
    pickPublicAddress([{ address: "93.184.216.34", family: 4 }, { address: "2606:2800::1", family: 6 }]),
    { address: "93.184.216.34", family: 4 },
  );
});

test("pinnedGet connects to the pinned address, not to what the hostname resolves to", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain", "x-host": request.headers.host ?? "" });
    response.end("pinned");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    // `.invalid` can never resolve (RFC 6761), so any response proves the
    // connect used the pinned address and did no lookup of its own.
    const response = await pinnedGet(
      new URL(`http://rebind.invalid:${port}/`),
      { address: "127.0.0.1", family: 4 },
      AbortSignal.timeout(2_000),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-host"), `rebind.invalid:${port}`, "Host keeps the real hostname");
    assert.equal(await readCapped(response), "pinned");
  } finally {
    server.close();
  }
});

test("safeFetch refuses loopback literals, including the hex-mapped IPv6 form, before connecting", async () => {
  await assert.rejects(safeFetch("http://127.0.0.1:9/"), /won't fetch/);
  await assert.rejects(safeFetch("http://[::ffff:7f00:1]:9/"), /won't fetch/);
});
