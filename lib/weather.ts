// Weather at the plan's event time, from Open-Meteo (free, keyless, CC BY 4.0
// -- anything rendering this must credit Open-Meteo). Pure functions only:
// app/api/weather/route.ts does the one network call, the browser never talks
// to Open-Meteo (CSP connect-src stays 'self' + Supabase).
//
// Dubai is UTC+4 all year (no DST), so "local hour" is a fixed offset. The
// request asks Open-Meteo for exactly one hour (start_hour = end_hour), which
// keeps the payload tiny and makes the upstream URL -- and so the server's
// fetch cache key -- lat/lon at 1dp (~11 km, finer than the forecast grid)
// plus that hour. Coarse on purpose: it bounds how many distinct upstream
// calls anyone can force through the public route.

export const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Open-Meteo's forecast covers today plus 15 more local days (16 total). */
export const FORECAST_DAYS_AHEAD = 15;
/** A plan that started under an hour ago still gets its forecast. */
export const PAST_GRACE_MS = HOUR_MS;

/** UAE, generously boxed. Anything outside is not a plan this app deals. */
export const UAE_BOUNDS = { minLat: 22.5, maxLat: 26.5, minLon: 51, maxLon: 56.5 } as const;

/*
 * Verdict thresholds, Dubai-tuned. Checked top to bottom, first match wins.
 * Feels-like (apparent temperature) drives heat, not air temperature: a 34°C
 * August evening at 60% humidity feels past 40°C, and that is what decides
 * terrace vs. indoors.
 *
 *   extreme-heat  feels >= 40°C        pick indoors or after sunset
 *   rain          rain chance >= 50%   rare here, but it empties terraces
 *   wind          wind >= 35 km/h      dust and blowing sand outdoors
 *   hot           feels >= 34°C        shade or indoors
 *   warm          feels >= 28°C        fine outdoors, lightly
 *   comfortable   below all of the above
 */
export const THRESHOLDS = {
  extremeFeelsC: 40,
  rainPct: 50,
  windKph: 35,
  hotFeelsC: 34,
  warmFeelsC: 28,
} as const;

export type WeatherVerdict = "comfortable" | "warm" | "hot" | "extreme-heat" | "rain" | "wind";

export interface WeatherSummary {
  /** ISO (UTC) of the forecast hour actually used. */
  at: string;
  tempC: number;
  feelsC: number;
  rainPct: number | null;
  windKph: number | null;
  humidityPct: number | null;
  verdict: WeatherVerdict;
}

export function inUae(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= UAE_BOUNDS.minLat && lat <= UAE_BOUNDS.maxLat
    && lon >= UAE_BOUNDS.minLon && lon <= UAE_BOUNDS.maxLon
  );
}

const localDay = (ms: number) => Math.floor((ms + DUBAI_OFFSET_MS) / DAY_MS);

/** True when `at` has a forecast: not more than an hour gone, and on or
 *  before the last local day Open-Meteo covers. */
export function withinForecastWindow(at: Date, now: Date): boolean {
  const t = at.getTime();
  if (!Number.isFinite(t)) return false;
  if (t < now.getTime() - PAST_GRACE_MS) return false;
  return localDay(t) <= localDay(now.getTime()) + FORECAST_DAYS_AHEAD;
}

/** `at` rounded to the nearest hour, as Dubai wall time "YYYY-MM-DDTHH:00". */
export function dubaiHour(at: Date): string {
  const rounded = Math.round(at.getTime() / HOUR_MS) * HOUR_MS;
  return new Date(rounded + DUBAI_OFFSET_MS).toISOString().slice(0, 13) + ":00";
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function forecastUrl(lat: number, lon: number, at: Date): string {
  const hour = dubaiHour(at);
  const params = new URLSearchParams({
    latitude: round1(lat).toFixed(1),
    longitude: round1(lon).toFixed(1),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,relative_humidity_2m",
    timezone: "Asia/Dubai",
    start_hour: hour,
    end_hour: hour,
  });
  return `${OPEN_METEO_FORECAST}?${params}`;
}

export function verdictFor(feelsC: number, rainPct: number | null, windKph: number | null): WeatherVerdict {
  if (feelsC >= THRESHOLDS.extremeFeelsC) return "extreme-heat";
  if (rainPct != null && rainPct >= THRESHOLDS.rainPct) return "rain";
  if (windKph != null && windKph >= THRESHOLDS.windKph) return "wind";
  if (feelsC >= THRESHOLDS.hotFeelsC) return "hot";
  if (feelsC >= THRESHOLDS.warmFeelsC) return "warm";
  return "comfortable";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The forecast hour nearest `at`, summarised -- or null when the response
 * is malformed or has no usable hour. Never a guessed value: temperature and
 * feels-like are required; rain/wind/humidity may be null (the verdict then
 * just can't be "rain"/"wind").
 */
export function summarise(body: unknown, at: Date): WeatherSummary | null {
  if (!isRecord(body) || !isRecord(body.hourly)) return null;
  const h = body.hourly;
  if (!Array.isArray(h.time)) return null;
  const col = (key: string): unknown[] => (Array.isArray(h[key]) ? (h[key] as unknown[]) : []);
  const temp = col("temperature_2m");
  const feels = col("apparent_temperature");
  const rain = col("precipitation_probability");
  const wind = col("wind_speed_10m");
  const humidity = col("relative_humidity_2m");
  // Times are local wall time without an offset; the response says which.
  const offsetMs = (num(body.utc_offset_seconds) ?? DUBAI_OFFSET_MS / 1000) * 1000;

  let pick: { i: number; ms: number; gap: number } | null = null;
  for (let i = 0; i < h.time.length; i++) {
    const t: unknown = h.time[i];
    if (typeof t !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) continue;
    const ms = Date.parse(`${t}:00Z`) - offsetMs;
    if (!Number.isFinite(ms) || num(temp[i]) == null || num(feels[i]) == null) continue;
    const gap = Math.abs(ms - at.getTime());
    if (!pick || gap < pick.gap) pick = { i, ms, gap };
  }
  // Nothing within 90 minutes means the response is for some other time.
  if (!pick || pick.gap > 1.5 * HOUR_MS) return null;

  const tempC = Math.round(temp[pick.i] as number);
  const feelsC = Math.round(feels[pick.i] as number);
  const rainPct = num(rain[pick.i]);
  const windKph = num(wind[pick.i]);
  const humidityPct = num(humidity[pick.i]);
  return {
    at: new Date(pick.ms).toISOString(),
    tempC,
    feelsC,
    rainPct: rainPct == null ? null : Math.round(rainPct),
    windKph: windKph == null ? null : Math.round(windKph),
    humidityPct: humidityPct == null ? null : Math.round(humidityPct),
    verdict: verdictFor(feelsC, rainPct, windKph),
  };
}

/** Parses the route's own query string. null on anything not strictly valid. */
export function parseWeatherQuery(
  params: URLSearchParams,
  now: Date,
): { lat: number; lon: number; at: Date } | null {
  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  const rawAt = params.get("at");
  if (!rawLat || !rawLon || !rawAt) return null;
  const decimal = /^-?\d{1,3}(\.\d{1,8})?$/;
  if (!decimal.test(rawLat) || !decimal.test(rawLon)) return null;
  // ISO 8601 with an explicit zone only: a bare local time is ambiguous.
  if (rawAt.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(rawAt)) return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  const at = new Date(rawAt);
  if (!inUae(lat, lon) || !withinForecastWindow(at, now)) return null;
  return { lat, lon, at };
}
