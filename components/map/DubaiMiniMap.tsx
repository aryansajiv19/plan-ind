import { METRO_LINES } from "@/lib/metro-lines";
import { nearestStation } from "@/lib/dubai-metro";
import { googleMapsUrl, type MappableVenue } from "@/lib/directions";

// Our own map of how to reach a place: the Dubai Metro drawn through its real
// stations, the nearest one lit, the walk from it dashed, and the venue as a
// sand pin, framed on the neighbourhood. No map tiles and no Google: open
// data we hold (lib/dubai-metro.ts, OSM/ODbL). "Open in Google Maps" hands
// off for turn-by-turn.
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

  return (
    <figure className="mini-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map: ${venue.name}${near ? `, ${near.walkMin} min walk from ${near.station.name} metro` : ""}`}>
        <defs>
          <radialGradient id="mini-map-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor="#174050" stopOpacity="0.55" />
            <stop offset="1" stopColor="#07090d" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#mini-map-glow)" />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`g${i}`} x1={(i + 1) * (W / 10)} y1="0" x2={(i + 1) * (W / 10)} y2={H} className="mini-map__grid" />
        ))}
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
        {near && (
          <>
            <line x1={x(near.station.lng)} y1={y(near.station.lat)} x2={pin.x} y2={pin.y} className="mini-map__walk" />
            <circle cx={x(near.station.lng)} cy={y(near.station.lat)} r="8" className="mini-map__near" />
            <text x={x(near.station.lng) + 12} y={y(near.station.lat) + 4} className="mini-map__label">{near.station.name}</text>
          </>
        )}
        <circle cx={pin.x} cy={pin.y} r="16" className="mini-map__pulse" />
        <path d={`M${pin.x} ${pin.y + 2} l-9 -15 a10.5 10.5 0 1 1 18 0 z`} className="mini-map__pin" />
        <text x={pin.x + 14} y={pin.y - 12} className="mini-map__label mini-map__label--venue">{venue.name}</text>
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
  const pad = 30;
  const x = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * pad);
  const y = (lat: number) => pad + (1 - (lat - minLat) / (maxLat - minLat)) * (H - 2 * pad);
  return (
    <figure className="mini-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Dubai Metro map; ${venue.name} is in ${venue.area}`}>
        {METRO_LINES.map((line) => (
          <polyline key={line.key} points={line.stations.map((s) => `${x(s.lng).toFixed(1)},${y(s.lat).toFixed(1)}`).join(" ")}
            fill="none" stroke={LINE[line.color]} strokeWidth="3" strokeLinejoin="round" opacity="0.8" />
        ))}
        {all.map((s) => <circle key={`${s.name}-${s.lat}`} cx={x(s.lng)} cy={y(s.lat)} r="3" className="mini-map__station" />)}
      </svg>
      <figcaption>
        <span>{venue.area} · the exact spot isn’t mapped yet</span>
        <a href={googleMapsUrl(venue)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}
