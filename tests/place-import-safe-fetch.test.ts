import assert from "node:assert/strict";
import test from "node:test";
import { readCapped } from "../lib/place-import/safe-fetch.ts";
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
