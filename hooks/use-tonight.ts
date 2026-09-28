"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { distanceKm } from "@/lib/dubai-areas";
import { driveMinutesEstimate } from "@/lib/directions";
import { withinForecastWindow, type WeatherSummary } from "@/lib/weather";
import { tonightRows } from "@/lib/tonight";
import { useViewerOrigin } from "@/hooks/use-viewer-origin";
import type { Plan, Spot } from "@/lib/types";

const VERDICTS = new Set(["extreme-heat", "hot", "rain", "wind", "warm", "comfortable"]);
const isSummary = (v: unknown): v is WeatherSummary => {
  const s = v as Partial<WeatherSummary> | null;
  return typeof s?.tempC === "number" && typeof s.feelsC === "number" && typeof s.verdict === "string" && VERDICTS.has(s.verdict);
};

/**
 * The Tonight panel's reads, all ones the page already makes or can make
 * for free: the forecast with PlanWeather's exact URL (the route sends
 * private, max-age=600, so the browser answers the second one), and one
 * read of visits here, which RLS limits to this account's and its friends'.
 * Travel is the straight-line drive estimate: no Google call.
 */
export function useTonight({ plan, winner, coming }: { plan: Plan; winner: Spot; coming: number }) {
  const viewer = useViewerOrigin();
  const [weather, setWeather] = useState<{ key: string; summary: WeatherSummary } | null>(null);
  const [friends, setFriends] = useState<{ spot: string; count: number } | null>(null);
  const at = plan.event_time;
  const weatherKey = at && winner.latitude != null && winner.longitude != null ? `${winner.latitude},${winner.longitude},${at}` : null;

  useEffect(() => {
    if (!weatherKey || !at || !withinForecastWindow(new Date(at), new Date())) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(winner.latitude), lon: String(winner.longitude), at: new Date(at).toISOString() });
    fetch(`/api/weather?${params}`, { signal: controller.signal })
      .then((res) => (res.status === 200 ? res.json() : null))
      .then((body: unknown) => { if (isSummary(body)) setWeather({ key: weatherKey, summary: body }); })
      .catch(() => { /* aborted or offline: no weather row */ });
    return () => controller.abort();
  }, [weatherKey, at, winner.latitude, winner.longitude]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: auth } = await getSupabase().auth.getUser();
      if (!auth.user) return;
      const { data, error } = await getSupabase().from("visits").select("person_id").eq("spot_id", winner.id).limit(500);
      if (!live || error) return; // unread: no row, never "0 friends"
      // people.id is the account id for signed-in profiles (064).
      const others = new Set((data ?? []).map((row) => row.person_id as string).filter((id) => id !== auth.user!.id));
      setFriends({ spot: winner.id, count: others.size });
    })();
    return () => { live = false; };
  }, [winner.id]);

  const origin = viewer.origin ?? (plan.origin_latitude != null && plan.origin_longitude != null
    ? { latitude: plan.origin_latitude, longitude: plan.origin_longitude } : null);
  const minutes = origin && winner.latitude != null && winner.longitude != null
    ? driveMinutesEstimate(distanceKm(origin, { latitude: winner.latitude, longitude: winner.longitude })) : null;

  return tonightRows({
    eventTime: at,
    spot: winner,
    coming,
    booked: plan.booked,
    bookingOwner: plan.booking_owner,
    weather: weather?.key === weatherKey ? weather.summary : null,
    travel: minutes != null ? { minutes, how: "drive (estimate)" } : null,
    friendsBeen: friends?.spot === winner.id ? friends.count : null,
  });
}
