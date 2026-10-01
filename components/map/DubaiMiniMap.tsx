import { METRO_LINES } from "@/lib/metro-lines";
import { nearestStation } from "@/lib/dubai-metro";
import { googleMapsUrl, type MappableVenue } from "@/lib/directions";
import Basemap, { basemapLabels } from "@/components/map/Basemap";
import MapLabels from "@/components/map/MapLabels";

// Our own map of how to reach a place: the Dubai Metro drawn through its real
// stations, the nearest one lit, the walk from it dashed, and the venue as a
// sand pin, framed on the neighbourhood, over a drawn Dubai (components/map/
// Basemap.tsx: coast, water, roads, district names). No map tiles and no
// Google: open data we hold (OSM/ODbL). "Open in Google Maps" hands off for
// turn-by-turn.
const W = 640;
const H = 360;
const LINE = { Red: "#e25c5c", Green: "#4caf7d" } as const;

export default function DubaiMiniMap({ venue }: { venue: MappableVenue }) {
  if (venue.latitude == null || venue.longitude == null) return <CityMap venue={venue} />;
  const at = { lat: venue.latitude, lng: venue.longitude };
  const near = nearestStation(at.lat, at.lng);
  // Frame the venue and its nearest station, with at least ~2.5 km around.
  const spanLat = Math.max(0.045, near ? Math.abs(near.station.lat - at.lat) * 2.6 : 0);
  const k = Math.cos((at.lat * Math.PI) / 180);
  const spanLng = Math.max(spanLat * (W / H) / k, near ? (Math.abs(near.station.lng - at.lng) * 2.6) : 0);
  const cLat = near ? (at.lat + near.station.lat) / 2 : at.lat;
  const cLng = near ? (at.lng + near.station.lng) / 2 : at.lng;
  const x = (lng: number) => ((lng - cLng) / spanLng + 0.5) * W;
  const y = (lat: number) => (0.5 - (lat - cLat) / spanLat) * H;
  const pin = { x: x(at.lng), y: y(at.lat) };
  const st = near ? { x: x(near.station.lng), y: y(near.station.lat) } : null;
  const project = (lng: number, lat: number): [number, number] => [x(lng), y(lat)];
  const base = basemapLabels(project, W, H);

  return (
    <figure className="mini-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map: ${venue.name}${near ? `, ${near.walkMin} min walk from ${near.station.name} metro` : ""}`}>
        <Basemap project={project} w={W} h={H} />
        {METRO_LINES.map((line) => (
          <polyline
            key={line.key}
            points={line.stations.map((s) => `${x(s.lng).toFixed(1)},${y(s.lat).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={LINE[line.color]}
            strokeWidth="4"
            strokeLinejoin="round"
            opacity="0.85"
          />
        ))}
        {METRO_LINES.flatMap((line) => line.stations).map((s) => (
          <circle key={`${s.name}-${s.lat}`} cx={x(s.lng)} cy={y(s.lat)} r="4" className="mini-map__station" />
        ))}
        {near && st && (
          <>
            <line x1={st.x} y1={st.y} x2={pin.x} y2={pin.y} className="mini-map__walk" />
            <circle cx={st.x} cy={st.y} r="8" className="mini-map__near" />
          </>
        )}
        <circle cx={pin.x} cy={pin.y} r="16" className="mini-map__pulse" />
        <path d={`M${pin.x} ${pin.y + 2} l-9 -15 a10.5 10.5 0 1 1 18 0 z`} className="mini-map__pin" />
        <MapLabels
          w={W} h={H} candidates={base.candidates}
          keep={[...base.keep, { x: pin.x, y: pin.y - 8, r: 18 }, ...(st ? [{ x: st.x, y: st.y, r: 10 }] : [])]}
          fixed={[
            { text: venue.name, x: pin.x, y: pin.y, dy: -12, size: 18, perChar: 0.46, place: "side", className: "mini-map__label mini-map__label--venue" },
            ...(near && st ? [{ text: near.station.name, x: st.x, y: st.y, dy: 4, gap: 12, size: 13, place: "side" as const, className: "mini-map__label" }] : []),
          ]}
        />
      </svg>
      <figcaption>
        {near ? (
          <span>{near.walkable ? `≈ ${near.walkMin} min walk from ${near.station.name} (${near.station.lines.join(" / ")} Line)` : `Nearest metro: ${near.station.name}, ${near.km.toFixed(1)} km: take a taxi or drive`}</span>
        ) : <span>{venue.area}</span>}
        <a href={googleMapsUrl(venue)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}

// No coordinates yet: the whole metro network, the area named, and the
// hand-off to Google Maps. Never an empty "Where".
function CityMap({ venue }: { venue: MappableVenue }) {
  const all = METRO_LINES.flatMap((line) => line.stations);
  const lats = all.map((s) => s.lat), lngs = all.map((s) => s.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  // The network fitted at its true shape (longitude shrunk for Dubai's latitude).
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const s = Math.min((W - 60) / ((maxLng - minLng) * k), (H - 60) / (maxLat - minLat));
  const x = (lng: number) => W / 2 + (lng - (minLng + maxLng) / 2) * k * s;
  const y = (lat: number) => H / 2 - (lat - (minLat + maxLat) / 2) * s;
  const city = basemapLabels((lng, lat) => [x(lng), y(lat)], W, H);
  return (
    <figure className="mini-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dubai Metro map; ${venue.name} is in ${venue.area}`}>
        <Basemap project={(lng, lat) => [x(lng), y(lat)]} w={W} h={H} />
        {METRO_LINES.map((line) => (
          <polyline key={line.key} points={line.stations.map((st) => `${x(st.lng).toFixed(1)},${y(st.lat).toFixed(1)}`).join(" ")}
            fill="none" stroke={LINE[line.color]} strokeWidth="3" strokeLinejoin="round" opacity="0.8" />
        ))}
        {all.map((st) => <circle key={`${st.name}-${st.lat}`} cx={x(st.lng)} cy={y(st.lat)} r="3" className="mini-map__station" />)}
        <MapLabels w={W} h={H} fixed={[]} maxLabels={6} candidates={city.candidates}
          keep={[...city.keep, ...all.map((st) => ({ x: x(st.lng), y: y(st.lat), r: 5 }))]} />
      </svg>
      <figcaption>
        <span>{venue.area} · the exact spot isn’t mapped yet</span>
        <a href={googleMapsUrl(venue)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}
