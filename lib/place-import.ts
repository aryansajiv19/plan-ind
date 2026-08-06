export type PlaceLinkProvider = "instagram" | "tiktok" | "facebook" | "reddit" | "youtube" | "web";
export type PlaceCollectionKind = "want_to_try" | "planning";

export interface PlaceLinkCandidate {
  provider: PlaceLinkProvider;
  providerLabel: string;
  normalizedUrl: string;
}

const TRACKING_PARAMETERS = ["fbclid", "gclid", "igshid", "si"];

export function classifyPlaceLink(input: string): PlaceLinkCandidate {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste a complete link beginning with http or https.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only web links can be imported.");
  }
  if (url.username || url.password) throw new Error("Links containing credentials cannot be imported.");

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const provider: PlaceLinkProvider = host === "instagram.com" || host.endsWith(".instagram.com")
    ? "instagram"
    : host === "tiktok.com" || host.endsWith(".tiktok.com")
      ? "tiktok"
      : host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch"
        ? "facebook"
        : host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it"
          ? "reddit"
          : host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be"
            ? "youtube"
            : "web";

  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";

  const labels: Record<PlaceLinkProvider, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    reddit: "Reddit",
    youtube: "YouTube",
    web: host,
  };
  return { provider, providerLabel: labels[provider], normalizedUrl: url.toString() };
}
