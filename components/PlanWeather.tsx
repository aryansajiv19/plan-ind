"use client";

import { useEffect, useState } from "react";
import { dubaiHour, THRESHOLDS, withinForecastWindow, type WeatherSummary, type WeatherVerdict } from "@/lib/weather";

// One restrained line under the plan's time: what the evening will feel like
// at the venue. Loading renders nothing and so does any failure. A forecast
// is optional context, never a fake value.

const ADVICE: Record<WeatherVerdict, string> = {
  "extreme-heat": "Extreme heat. Pick indoors, or go after sunset.",
  hot: "Hot. Shade or indoors.",
  rain: "Rain likely. Have an indoor plan B.",
  wind: "Windy. Outdoor seating may be dusty.",
  warm: "Warm, fine outdoors.",
  comfortable: "Comfortable outdoors.",
};

const VERDICTS = new Set<string>(Object.keys(ADVICE));
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);

function isSummary(v: unknown): v is WeatherSummary {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.at === "string" && isNum(s.tempC) && isNum(s.feelsC)
    && isNumOrNull(s.rainPct) && isNumOrNull(s.windKph)
    && typeof s.verdict === "string" && VERDICTS.has(s.verdict);
}

interface PlanWeatherProps {
  latitude: number;
  longitude: number;
  /** ISO timestamp of the outing. */
  at: string;
}

export default function PlanWeather({ latitude, longitude, at }: PlanWeatherProps) {
  const key = `${latitude},${longitude},${at}`;
  // Tagged with the inputs it answers, so a changed time never shows the
  // previous time's forecast while the new one loads.
  const [result, setResult] = useState<{ key: string; summary: WeatherSummary } | null>(null);

  useEffect(() => {
    if (!withinForecastWindow(new Date(at), new Date())) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), at: new Date(at).toISOString() });
    fetch(`/api/weather?${params}`, { signal: controller.signal })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((body: unknown) => {
        if (isSummary(body)) setResult({ key, summary: body });
      })
      .catch(() => {
        // Aborted on unmount, offline, or a bad body: show nothing.
      });
    return () => controller.abort();
  }, [key, latitude, longitude, at]);

  const summary = result?.key === key ? result.summary : null;
  if (!summary) return null;

  const hour = new Date(summary.at).toLocaleTimeString(undefined, { hour: "numeric" });
  // "Go after sunset" is no advice for a 10pm plan. Dubai sunset runs about
  // 5:30pm to 7:15pm across the year; 7pm to 6am local counts as after dark.
  const localHour = Number(dubaiHour(new Date(summary.at)).slice(11, 13));
  const afterDark = localHour >= 19 || localHour < 6;
  const advice = summary.verdict === "extreme-heat" && afterDark
    ? "Extreme heat even after dark. Pick indoors."
    : ADVICE[summary.verdict];
  const extras = [
    summary.rainPct != null && summary.rainPct >= 30 ? `${summary.rainPct}% chance of rain` : null,
    summary.windKph != null && summary.windKph >= THRESHOLDS.windKph - 10 ? `wind ${summary.windKph} km/h` : null,
  ].filter(Boolean);

  return (
    <p className="mt-1 text-sm text-muted">
      <span className="font-medium text-ink">
        {summary.tempC}°C, feels like {summary.feelsC}°C
      </span>{" "}
      at {hour}
      {extras.length > 0 && `, ${extras.join(", ")}`}. {advice}{" "}
      <a
        href="https://open-meteo.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs underline"
      >
        Forecast by Open-Meteo
      </a>
    </p>
  );
}
