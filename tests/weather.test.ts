import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  dubaiHour,
  forecastUrl,
  inUae,
  parseWeatherQuery,
  summarise,
  THRESHOLDS,
  verdictFor,
  withinForecastWindow,
} from "../lib/weather.ts";

// Hermetic: a recorded-shape Open-Meteo response, never the network.
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/open-meteo-dubai-evening.json", import.meta.url), "utf8"),
) as { hourly: Record<string, unknown[]> };

const NOW = new Date("2026-09-24T12:00:00Z"); // 4pm in Dubai
const q = (s: string) => new URLSearchParams(s);

test("the forecast URL rounds lat/lon to 2dp and asks for one Dubai hour", () => {
  // 16:10Z = 20:10 Dubai, nearest hour 20:00.
  const url = new URL(forecastUrl(25.19734, 55.27441, new Date("2026-09-25T16:10:00Z")));
  assert.equal(url.origin + url.pathname, "https://api.open-meteo.com/v1/forecast");
  assert.equal(url.searchParams.get("latitude"), "25.20");
  assert.equal(url.searchParams.get("longitude"), "55.27");
  assert.equal(url.searchParams.get("timezone"), "Asia/Dubai");
  assert.equal(url.searchParams.get("start_hour"), "2026-09-25T20:00");
  assert.equal(url.searchParams.get("end_hour"), "2026-09-25T20:00");
  assert.deepEqual(
    url.searchParams.get("hourly")?.split(","),
    ["temperature_2m", "apparent_temperature", "precipitation_probability", "wind_speed_10m", "relative_humidity_2m"],
  );
});

test("two nearby points in the same hour share one cache key (same upstream URL)", () => {
  const a = forecastUrl(25.2012, 55.2711, new Date("2026-09-25T16:05:00Z"));
  const b = forecastUrl(25.1989, 55.2739, new Date("2026-09-25T15:40:00Z"));
  assert.equal(a, b);
  const later = forecastUrl(25.2012, 55.2711, new Date("2026-09-25T17:05:00Z"));
  assert.notEqual(a, later);
});

test("dubaiHour rounds to the nearest hour in UTC+4, across midnight", () => {
  assert.equal(dubaiHour(new Date("2026-09-25T19:40:00Z")), "2026-09-26T00:00");
  assert.equal(dubaiHour(new Date("2026-09-25T19:29:00Z")), "2026-09-25T23:00");
});

test("summarise picks the hour nearest the event, not the first one", () => {
  const s = summarise(fixture, new Date("2026-09-25T16:10:00Z")); // 20:10 Dubai
  assert.ok(s);
  assert.equal(s.at, "2026-09-25T16:00:00.000Z");
  assert.equal(s.tempC, 34);
  assert.equal(s.feelsC, 41);
  assert.equal(s.rainPct, 0);
  assert.equal(s.windKph, 11);
  assert.equal(s.humidityPct, 60);
  assert.equal(s.verdict, "extreme-heat");
});

test("summarise returns null when no hour is near the event (never a stale value)", () => {
  assert.equal(summarise(fixture, new Date("2026-09-26T16:00:00Z")), null);
});

test("summarise returns null on malformed bodies instead of guessing", () => {
  assert.equal(summarise(null, NOW), null);
  assert.equal(summarise({ error: true, reason: "Parameter out of range" }, NOW), null);
  assert.equal(summarise({ hourly: { time: "2026-09-25T20:00" } }, NOW), null);
  // Feels-like missing at every hour: no summary, never a hole rendered as 0°.
  const holed = structuredClone(fixture);
  holed.hourly.apparent_temperature = [null, null, null];
  assert.equal(summarise(holed, new Date("2026-09-25T16:00:00Z")), null);
});

test("optional columns missing still summarise, with nulls", () => {
  const partial = structuredClone(fixture);
  delete partial.hourly.precipitation_probability;
  delete partial.hourly.wind_speed_10m;
  const s = summarise(partial, new Date("2026-09-25T16:00:00Z"));
  assert.ok(s);
  assert.equal(s.rainPct, null);
  assert.equal(s.windKph, null);
});

test("verdict thresholds, Dubai-tuned, first match wins", () => {
  assert.equal(verdictFor(THRESHOLDS.extremeFeelsC, 0, 0), "extreme-heat");
  assert.equal(verdictFor(45, 80, 50), "extreme-heat"); // heat outranks rain/wind
  assert.equal(verdictFor(39, THRESHOLDS.rainPct, 0), "rain");
  assert.equal(verdictFor(30, 10, THRESHOLDS.windKph), "wind");
  assert.equal(verdictFor(39, 49, 34), "hot");
  assert.equal(verdictFor(THRESHOLDS.hotFeelsC, null, null), "hot");
  assert.equal(verdictFor(THRESHOLDS.warmFeelsC, null, null), "warm");
  assert.equal(verdictFor(27, null, null), "comfortable");
});

test("UAE bounding box", () => {
  assert.equal(inUae(25.2, 55.27), true); // Dubai
  assert.equal(inUae(24.45, 54.38), true); // Abu Dhabi
  assert.equal(inUae(51.5, -0.12), false); // London
  assert.equal(inUae(Number.NaN, 55), false);
});

test("forecast window: under an hour past through 15 local days ahead", () => {
  assert.equal(withinForecastWindow(new Date("2026-09-24T11:30:00Z"), NOW), true);
  assert.equal(withinForecastWindow(new Date("2026-09-24T10:30:00Z"), NOW), false);
  // Today (24th, Dubai) + 15 = Oct 9 local, which ends at 19:59:59Z.
  assert.equal(withinForecastWindow(new Date("2026-10-09T19:59:00Z"), NOW), true);
  assert.equal(withinForecastWindow(new Date("2026-10-09T20:00:00Z"), NOW), false);
  assert.equal(withinForecastWindow(new Date("nope"), NOW), false);
});

test("parseWeatherQuery accepts a good query and rejects everything else", () => {
  const good = parseWeatherQuery(q("lat=25.2&lon=55.27&at=2026-09-25T16:00:00.000Z"), NOW);
  assert.ok(good);
  assert.equal(good.lat, 25.2);
  assert.ok(parseWeatherQuery(q("lat=25.2&lon=55.27&at=2026-09-25T20:00%2B04:00"), NOW));

  const bad = [
    "", // nothing
    "lat=25.2&lon=55.27", // no time
    "lat=51.5&lon=-0.12&at=2026-09-25T16:00:00Z", // London
    "lat=25.2&lon=55.27&at=2026-09-25T16:00", // no zone: ambiguous
    "lat=25.2&lon=55.27&at=2026-12-25T16:00:00Z", // past the horizon
    "lat=25.2&lon=55.27&at=2026-09-20T16:00:00Z", // in the past
    "lat=1e1&lon=55.27&at=2026-09-25T16:00:00Z", // exponent
    "lat=25.2abc&lon=55.27&at=2026-09-25T16:00:00Z",
    "lat=Infinity&lon=55.27&at=2026-09-25T16:00:00Z",
    "lat=25.2&lon=55.27&at=tomorrow",
  ];
  for (const s of bad) assert.equal(parseWeatherQuery(q(s), NOW), null, s);
});
