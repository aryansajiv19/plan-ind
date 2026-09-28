"use client";

import { useEffect, useRef, useState } from "react";
import VenueMap from "@/components/VenueMap";
import { leaveBy, LEAVE_BY_SPARE_MIN, type MappableVenue } from "@/lib/directions";
import type { Coordinates } from "@/lib/dubai-areas";
import { loadMaps, onMapsAuthFailure, type MapsApi, type MapsMap, type MapsMarker, type MapsOverlay, type RoutesRoute } from "@/lib/maps-loader";
import { metroEstimate, routeSteps, type ApiStep } from "@/lib/route-steps";
import { useViewerOrigin } from "@/hooks/use-viewer-origin";
import { useLivePosition } from "@/hooks/use-live-position";

// The decided plan's live route: Google's own steps (Routes library,
// Route.computeRoutes) for transit, driving and walking, from the viewer's
// live position, else where they said they're coming from, else the plan's
// start. With no browser key, a refused key, or a failed call it shows the
// lib/dubai-metro.ts estimate and the keyless embed instead.
//
// Cost: nothing from Google loads until "Show the route" is tapped, and each
// mode is computed once per ~100 m of a chosen origin, or ~1 km while
// following live (the rounding below): each computeRoutes is billed, and
// a 20 km drive at 100 m would be ~200 of them. The dot itself moves on
// every fix.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
const MODES = [["TRANSIT", "Metro"], ["DRIVING", "Drive"], ["WALKING", "Walk"]] as const;
type Mode = (typeof MODES)[number][0];
type Result = { steps: string[]; minutes: number | null } | "failed";

const round = (c: Coordinates, places: number) => `${c.latitude.toFixed(places)},${c.longitude.toFixed(places)}`;
const point = (c: Coordinates) => ({ lat: c.latitude, lng: c.longitude });

export default function RouteMap({ venue, planOrigin, eventTime = null }: { venue: MappableVenue; planOrigin: Coordinates | null; eventTime?: string | null }) {
  const viewer = useViewerOrigin();
  const [live, setLive] = useState(false);
  const livePosition = useLivePosition(live);
  const origin = livePosition.position ?? viewer.origin ?? planOrigin;
  const destination = venue.latitude != null && venue.longitude != null ? { latitude: venue.latitude, longitude: venue.longitude } : null;

  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<Mode>("TRANSIT");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [google, setGoogle] = useState<{ maps: MapsApi; map: MapsMap } | "failed" | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drawn = useRef<MapsOverlay[]>([]);
  const dot = useRef<MapsMarker | null>(null);

  const usable = Boolean(KEY) && destination != null && google !== "failed";

  // Load the API and the map once shown.
  useEffect(() => {
    if (!shown || !KEY || !destination || !canvas.current) return;
    let live = true;
    const off = onMapsAuthFailure(() => { if (live) setGoogle("failed"); });
    const el = canvas.current;
    loadMaps(KEY)
      .then(async (maps) => {
        const { Map } = await maps.importLibrary("maps");
        // createPolylines needs a map id; DEMO_MAP_ID is Google's stock style.
        const map = new Map(el, { center: point(destination), zoom: 13, mapId: "DEMO_MAP_ID", disableDefaultUI: true, zoomControl: true });
        if (live) setGoogle({ maps, map });
      })
      .catch(() => { if (live) setGoogle("failed"); });
    return () => { live = false; off(); };
    // destination is derived from venue's coordinates, which don't change on a decided plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // One route per mode and ~100 m of origin.
  const requestKey = origin ? `${mode}:${round(origin, livePosition.position ? 2 : 3)}` : null;
  useEffect(() => {
    if (!google || google === "failed" || !origin || !destination || !requestKey || results[requestKey]) return;
    let live = true;
    void google.maps.importLibrary("routes")
      .then(({ Route }) => Route.computeRoutes({
        origin: point(origin),
        destination: point(destination),
        travelMode: mode,
        fields: ["path", "legs", "durationMillis"],
      }))
      .then(({ routes }) => {
        const route: RoutesRoute | undefined = routes?.[0];
        if (!live) return;
        if (!route) throw new Error("no route");
        drawn.current.forEach((line) => line.setMap(null));
        drawn.current = route.createPolylines();
        drawn.current.forEach((line) => line.setMap(google.map));
        const steps = (route.legs ?? []).flatMap((leg) => (leg.steps ?? []) as ApiStep[]);
        setResults((all) => ({ ...all, [requestKey]: { steps: routeSteps(steps, mode), minutes: route.durationMillis ? Math.round(route.durationMillis / 60_000) : null } }));
        const lats = [origin.latitude, destination.latitude];
        const lngs = [origin.longitude, destination.longitude];
        google.map.fitBounds({ north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) }, 48);
      })
      .catch(() => { if (live) setResults((all) => ({ ...all, [requestKey]: "failed" })); });
    return () => { live = false; };
    // origin/destination are captured through requestKey (rounded) on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google, requestKey]);

  // The live dot follows every fix, without recomputing the route.
  useEffect(() => {
    if (!google || google === "failed") return;
    const here = livePosition.position;
    if (!here) { dot.current?.setMap(null); dot.current = null; return; }
    if (!dot.current) {
      dot.current = new google.maps.Marker({
        map: google.map, title: "You",
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#1a73e8", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
    }
    dot.current.setPosition(point(here));
  }, [google, livePosition.position]);

  const result = requestKey ? results[requestKey] : undefined;
  const fallback = metroEstimate(origin, venue);
  const showFallback = !usable || result === "failed";
  // Google's minutes for the mode on screen, else the drive estimate.
  const travel = result && result !== "failed" && result.minutes != null
    ? { minutes: result.minutes, how: MODES.find(([value]) => value === mode)![1].toLowerCase() }
    : showFallback && fallback?.driveMin != null ? { minutes: fallback.driveMin, how: "drive (estimate)" } : null;
  const leave = leaveBy(eventTime, travel?.minutes ?? null);

  return (
    <section className="route-map" aria-label={`Route to ${venue.name}`}>
      <div className="route-map__origin">
        <span>
          {livePosition.position ? "From where you are now (live)"
            : viewer.origin ? "From where you said you’re coming from"
              : planOrigin ? "From the plan’s start point"
                : "Share your location to see the way there"}
        </span>
        <button type="button" onClick={() => setLive((on) => !on)} aria-pressed={live}>{live ? "Stop following" : "Follow me live"}</button>
        {livePosition.error && <span role="status">{livePosition.error}</span>}
      </div>

      {leave && travel && (
        <p className="route-map__leave">
          Leave by {leave.toLocaleTimeString("en-GB", { timeZone: "Asia/Dubai", hour: "numeric", minute: "2-digit", hour12: true })}
          {" "}(≈ {travel.minutes} min {travel.how} + {LEAVE_BY_SPARE_MIN} spare)
        </p>
      )}

      {usable && !shown && <button type="button" onClick={() => setShown(true)}>Show the route</button>}

      {usable && shown && (
        <>
          <div role="group" aria-label="How you’re getting there" className="route-map__modes">
            {MODES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>
            ))}
          </div>
          <div ref={canvas} className="route-map__canvas" style={{ minHeight: "18rem" }} />
          {result && result !== "failed" && (
            <>
              {result.minutes != null && <p className="route-map__total">About {result.minutes} min</p>}
              <ol className="route-map__steps">{result.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
            </>
          )}
          {!result && origin && <p role="status">Finding the route…</p>}
          {result === "failed" && <p role="status">Google couldn’t route this right now. Here’s the estimate instead.</p>}
        </>
      )}

      {showFallback && (
        <>
          {fallback && fallback.steps.length > 0 && (
            <ol className="route-map__steps">{fallback.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          )}
          {fallback?.driveMin != null && <p className="route-map__total">≈ {fallback.driveMin} min drive (estimate)</p>}
          <VenueMap venue={venue} />
        </>
      )}
    </section>
  );
}
