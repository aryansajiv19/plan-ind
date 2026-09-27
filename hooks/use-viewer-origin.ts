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

  async function choose(value: string) {
    setGeoError(null);
    if (value === "") return save(null);
    if (value !== "device") return save({ value });
    if (!navigator.geolocation) return setGeoError("This browser can’t share its location. Pick an area instead.");
    // Blocked before any prompt is the page or the browser, not this person
    // saying no: the site's Permissions-Policy (where the browser exposes it),
    // then a "denied" the browser remembers for this site.
    const doc = document as Document & { permissionsPolicy?: { allowsFeature(feature: string): boolean }; featurePolicy?: { allowsFeature(feature: string): boolean } };
    if ((doc.permissionsPolicy ?? doc.featurePolicy)?.allowsFeature("geolocation") === false) {
      return setGeoError("This page can’t ask for your location. Pick an area instead.");
    }
    const permission = await navigator.permissions?.query({ name: "geolocation" }).catch(() => null);
    if (permission?.state === "denied") {
      return setGeoError("Location is blocked in this browser’s settings for this site. Allow it there, or pick an area.");
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const round = (n: number) => Math.round(n * 1000) / 1000;
        save({ device: { latitude: round(position.coords.latitude), longitude: round(position.coords.longitude) } });
      },
      (error) => {
        setLocating(false);
        setGeoError(
          error.code === error.PERMISSION_DENIED ? "You didn’t share your location. Pick an area instead."
            : error.code === error.TIMEOUT ? "Finding your location took too long. Try again, or pick an area."
              : "Your location couldn’t be found right now. Pick an area instead.",
        );
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
