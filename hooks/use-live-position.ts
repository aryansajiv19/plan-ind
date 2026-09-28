"use client";

import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/dubai-areas";

/**
 * The route map's live dot: watchPosition while `on`, cleared when switched
 * off or unmounted. Kept in memory only; never stored or sent to our server.
 */
export function useLivePosition(on: boolean) {
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("This browser can’t share its location.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (next) => {
        setError(null);
        setPosition({ latitude: next.coords.latitude, longitude: next.coords.longitude });
      },
      (failure) => setError(failure.code === failure.PERMISSION_DENIED
        ? "You didn’t share your location."
        : "Your location couldn’t be found right now."),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);

  return { position: on ? position : null, error: on ? error : null };
}
