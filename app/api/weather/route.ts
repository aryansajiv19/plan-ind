import { forecastUrl, parseWeatherQuery, summarise } from "@/lib/weather";

export const runtime = "nodejs";

// GET /api/weather?lat&lon&at=ISO -> WeatherSummary JSON, 400 on bad input,
// 204 when there is honestly nothing to show (upstream down, slow, or no
// usable hour). The browser never calls Open-Meteo itself.
//
// No CSRF token: this is a read with no side effect beyond a cached upstream
// fetch, and validateMutationRequest is for mutations. Cross-site browser
// callers are refused (a same-origin feature, not a public proxy).
//
// No quota: consumeQuota needs a Supabase session and a server-side scope
// that does not exist for this. Abuse is bounded instead by the strict
// input (UAE box, 16-day window) and the cache below: the upstream URL is
// lat/lon at 2dp plus one Dubai hour, cached for 30 minutes, so a whole
// group opening the same decided plan costs Open-Meteo one request.
const REVALIDATE_SECONDS = 1800;
const UPSTREAM_TIMEOUT_MS = 3000;

export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Cross-site requests are not accepted." }, { status: 403 });
  }
  const query = parseWeatherQuery(new URL(request.url).searchParams, new Date());
  if (!query) {
    return Response.json({ error: "lat, lon (UAE) and at (ISO, within 16 days) are required." }, { status: 400 });
  }

  const unavailable = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const res = await fetch(forecastUrl(query.lat, query.lon, query.at), {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("Weather upstream failed", JSON.stringify({ status: res.status }));
      return unavailable();
    }
    const summary = summarise(await res.json(), query.at);
    if (!summary) return unavailable();
    return Response.json(summary, {
      headers: { "Cache-Control": `public, max-age=600, s-maxage=${REVALIDATE_SECONDS}` },
    });
  } catch (error) {
    console.error("Weather upstream failed", JSON.stringify({ code: error instanceof Error ? error.name : "unknown" }));
    return unavailable();
  }
}
