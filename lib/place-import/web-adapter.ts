import "server-only";

import { safeFetch } from "./safe-fetch";
import type { ExtractedClues } from "./oembed";

// Generic adapter for the `web` provider -- an arbitrary site, not a fixed
// trusted host. safeFetch() does the SSRF hardening; this just pulls three
// Open Graph meta tags out of the first slice of markup. No HTML-parsing
// dependency for three attributes -- a plain regex scan over the capped
// response is enough, cheerio/jsdom would be overkill for this.
// Only the first slice of the document is scanned. og:/meta tags live in
// <head>, which this module's own comment already said -- but the code read
// the whole body anyway, and that was half of a denial-of-service.
const HEAD_SCAN_BYTES = 16 * 1024;
// Bounded so a single tag cannot be arbitrarily long. Real meta tags are far
// under this; the bound is what makes the pattern's cost linear.
const ATTR_RUN = "[^>]{0,200}?";

// ⚠ THESE PATTERNS MUST STAY NON-BACKTRACKING. The original used two
// unanchored `[^>]+` runs separated by literal anchors:
//
//   <meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']
//
// Markup carrying many `property="og:title"` occurrences with no following
// `content=` makes that backtrack super-linearly. Measured on this function:
// 7.6KB -> 69ms, 30KB -> 3.9s, 45KB -> 13.7s, 536KB -> still running after
// six minutes.
//
// That was a whole-process outage, not a slow request. safe-fetch's 512KB cap
// is the input size that makes it WORST, not a mitigation; its
// AbortController is already cleared before this runs; and resolvePlaceImport
// is awaited inside the route handler, so the spin is synchronous on Node's
// single event loop. Every route for every user stops. At 20 imports/minute,
// one user with one pasted link is an indefinite outage.
//
// Two changes together fix it, and both are load-bearing: cap the scanned
// length (above), and bound the attribute runs (ATTR_RUN) so there is no
// super-linear path left for a longer input to exploit.
//
// Exported for tests only (tests/place-import-safe-fetch.test.ts pins how a
// truncated document behaves here). Callers want fetchWebClues().
export function metaContent(html: string, property: string): string | null {
  const head = html.length > HEAD_SCAN_BYTES ? html.slice(0, HEAD_SCAN_BYTES) : html;
  const pattern = new RegExp(
    `<meta${ATTR_RUN}property=["']${property}["']${ATTR_RUN}content=["']([^"']*)["']`,
    "i",
  );
  const match = head.match(pattern);
  if (match?.[1]) return match[1].trim() || null;
  // Some sites emit content before property in the tag -- try the reverse order too.
  const reversed = head.match(
    new RegExp(`<meta${ATTR_RUN}content=["']([^"']*)["']${ATTR_RUN}property=["']${property}["']`, "i"),
  );
  return reversed?.[1]?.trim() || null;
}

export async function fetchWebClues(normalizedUrl: string): Promise<ExtractedClues> {
  const html = await safeFetch(normalizedUrl);
  return {
    title: metaContent(html, "og:title"),
    author: null,
    description: metaContent(html, "og:description"),
    thumbnailUrl: metaContent(html, "og:image"),
    sourceProvider: "web",
  };
}
