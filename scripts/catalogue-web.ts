// Read-only, polite fetches of a venue's own website for the catalogue
// review (089): the page title and meta description, nothing else. A real
// User-Agent, an 8 s timeout, the first 200 KB only.

export const USER_AGENT = "plan-ind catalogue review (https://plan-ind.vercel.app)";

const decode = (text: string) => text.replace(/&amp;/g, "&").replace(/&#39;|&#x27;|&rsquo;/g, "'").replace(/&quot;/g, "\"")
  .replace(/&#x?[0-9a-f]+;/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** A proposed vibe from someone else's words: one line, 30-120 chars, cut at a word; never a review or a sales line. */
export function cleanVibe(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = decode(raw);
  if (text.length < 30 || /https?:|www\.|cookie|javascript|©|\{|\}/i.test(text)) return null;
  if (/\b(rating|ratings|review|overpriced|stars?|only for|guests only|members only|book (now|online|a court)|order (now|online)|buy|marketplace|nft|franchise|official (site|website)|welcome to|log ?in|sign ?up|download|app store|coming soon|under construction|deals?|offer|discount)\b|%/i.test(text)) return null;
  if ((text.match(/[a-z]/gi)?.length ?? 0) < text.length * 0.6) return null;
  if (text.length <= 120) return text.replace(/[\s.,;:!-]+$/, "");
  const cut = text.slice(0, 120);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s.,;:!-]+$/, "");
}

export async function siteMeta(url: string): Promise<{ title: string | null; description: string | null; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 200_000);
    const meta = (key: string) =>
      new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i").exec(html)?.[1]
      ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${key}["']`, "i").exec(html)?.[1];
    const title = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1] ?? meta("og:title") ?? meta("og:site_name") ?? null;
    return {
      title: title ? decode(title) : null,
      description: cleanVibe(meta("description") ?? meta("og:description")),
      finalUrl: res.url,
    };
  } catch {
    return null;
  }
}
