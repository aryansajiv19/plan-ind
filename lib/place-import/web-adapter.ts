import "server-only";

import { safeFetch } from "./safe-fetch";
import type { ExtractedClues } from "./oembed";

// Generic adapter for the `web` provider -- an arbitrary site, not a fixed
// trusted host. safeFetch() does the SSRF hardening; this just pulls three
// Open Graph meta tags out of the first slice of markup. No HTML-parsing
// dependency for three attributes -- a plain regex scan over the capped
// response is enough, cheerio/jsdom would be overkill for this.
function metaContent(html: string, property: string): string | null {
  const pattern = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(pattern);
  if (match?.[1]) return match[1].trim() || null;
  // Some sites emit content before property in the tag -- try the reverse order too.
  const reversed = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i"),
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
