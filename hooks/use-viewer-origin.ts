"use client";

import { useEffect, useState } from "react";
import { DUBAI_ORIGINS, type Coordinates } from "@/lib/dubai-areas";

// P18: where THIS voter is coming from, so the cards show their own distance
// and drive, not the host's. Kept in this browser only and never sent to the
// server; the device location is rounded to about 100 m before it is stored.
const KEY = "deal-three:coming-from";
type Stored = { value: string } | { device: Coordinates };

export function useViewerOrigin() {
  const [stored, setStored] = useState<Stored | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
        if (typeof raw?.value === "string" || (Number.isFinite(raw?.device?.latitude) && Number.isFinite(raw?.device?.longitude))) setStored(raw as Stored);
      } catch { /* storage blocked or bad JSON: no origin */ }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function save(next: Stored | null) {
    setStored(next);
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch { /* storage blocked: it lasts this visit */ }
  }

  function choose(value: string) {
    setGeoError(null);
    if (value === "") return save(null);
    if (value !== "device") return save({ value });
    if (!navigator.geolocation) return setGeoError("This browser can’t share its location. Pick an area instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const round = (n: number) => Math.round(n * 1000) / 1000;
        save({ device: { latitude: round(position.coords.latitude), longitude: round(position.coords.longitude) } });
      },
      () => {
        setLocating(false);
        setGeoError("Location wasn’t shared. Pick an area instead.");
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  const origin: Coordinates | null = !stored ? null
    : "device" in stored ? stored.device
      : DUBAI_ORIGINS.find((option) => option.value === stored.value)?.coordinates ?? null;
  const selected = !stored ? "" : "device" in stored ? "device" : stored.value;
  return { origin, selected, choose, locating, geoError };
}

export type ViewerOrigin = ReturnType<typeof useViewerOrigin>;
