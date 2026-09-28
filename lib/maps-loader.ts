"use client";

// The Maps JavaScript API, loaded once with Google's own script tag
// (loading=async + callback), no npm package. The CSP allows it through
// 'strict-dynamic': this script element is created by the app's own
// nonced bundle. Only the pieces the route map uses are typed here.

export interface LatLng { lat: number; lng: number }
export interface MapsMap { fitBounds(bounds: { north: number; south: number; east: number; west: number }, padding?: number): void; setCenter(point: LatLng): void }
export interface MapsOverlay { setMap(map: MapsMap | null): void }
export interface MapsMarker extends MapsOverlay { setPosition(point: LatLng): void }
export interface RoutesRoute {
  durationMillis?: number | null;
  path?: LatLng[] | { lat(): number; lng(): number }[] | null;
  legs?: { steps?: unknown[] | null }[] | null;
  createPolylines(): MapsOverlay[];
}
export interface MapsApi {
  importLibrary(name: "maps"): Promise<{ Map: new (el: HTMLElement, options: Record<string, unknown>) => MapsMap }>;
  importLibrary(name: "routes"): Promise<{ Route: { computeRoutes(request: Record<string, unknown>): Promise<{ routes?: RoutesRoute[] }> } }>;
  Marker: new (options: Record<string, unknown>) => MapsMarker;
  SymbolPath: { CIRCLE: number };
}

type MapsWindow = Window & { google?: { maps?: MapsApi }; gm_authFailure?: () => void; __planIndMapsReady?: () => void };

let loading: Promise<MapsApi> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/**
 * Google calls gm_authFailure when the key is refused (wrong referrer, API
 * not enabled, billing). The map then shows its own error box, so callers
 * listen and swap in the fallback instead.
 */
export function onMapsAuthFailure(listener: () => void): () => void {
  if (authFailed) listener();
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

export function loadMaps(key: string): Promise<MapsApi> {
  if (loading) return loading;
  const w = window as MapsWindow;
  loading = new Promise<MapsApi>((resolve, reject) => {
    w.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((listener) => listener());
    };
    w.__planIndMapsReady = () => (w.google?.maps ? resolve(w.google.maps) : reject(new Error("Maps did not load")));
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__planIndMapsReady`;
    script.async = true;
    script.onerror = () => {
      loading = null; // a network blip may pass; let the next mount retry
      script.remove();
      reject(new Error("Maps did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
