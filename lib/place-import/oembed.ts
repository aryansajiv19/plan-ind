import "server-only";

import { safeFetch, SafeFetchError } from "./safe-fetch";
import type { PlaceLinkProvider } from "./classify";

export interface ExtractedClues {
  title: string | null;
  author: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  sourceProvider: PlaceLinkProvider;
}

// TikTok, YouTube and Reddit each expose a public, unauthenticated oEmbed
// endpoint -- a fixed, hardcoded host with the user's URL only as a query
// parameter. Instagram and Facebook's oEmbed/Graph APIs have required an
// approved app + access token since ~2018-2020; no credentials for either
// exist in this project, so those two are handled entirely by the caller
// (extract() below never gets invoked for them -- resolve.ts routes them
// straight to needs_input).
const OEMBED_HOSTS: Partial<Record<PlaceLinkProvider, (url: string) => string>> = {
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  youtube: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  reddit: (url) => `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`,
};

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchOembedClues(provider: PlaceLinkProvider, normalizedUrl: string): Promise<ExtractedClues> {
  const buildUrl = OEMBED_HOSTS[provider];
  if (!buildUrl) throw new SafeFetchError(`No oEmbed endpoint for provider "${provider}".`);

  const body = await safeFetch(buildUrl(normalizedUrl));
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SafeFetchError("That link's oEmbed response was not valid JSON.");
  }
  const record = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  return {
    title: stringField(record.title),
    author: stringField(record.author_name),
    description: null,
    thumbnailUrl: stringField(record.thumbnail_url),
    sourceProvider: provider,
  };
}
