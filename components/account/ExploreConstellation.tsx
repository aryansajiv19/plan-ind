"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Spot } from "@/lib/types";

// Discover's map view with no map key and no map library: every place with
// coordinates is a star on the night sky, drawn where it sits, so Dubai's
// shape comes out of its venues. Each star links to its place page; lines
// join each place to its nearest neighbour, like a constellation.
const W = 1000;
const H = 620;
const PAD = 40;

const CORE = { minLat: 24.95, maxLat: 25.33, minLng: 55.02, maxLng: 55.45 };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Located = Spot & { latitude: number; longitude: number };

export default function ExploreConstellation({ spots }: { spots: Spot[] }) {
  const { stars, lines } = useMemo(() => {
    const located = spots.filter((spot): spot is Located => spot.latitude != null && spot.longitude != null);
    if (located.length === 0) return { stars: [], lines: [] };
    const lats = located.map((spot) => spot.latitude);
    const lngs = located.map((spot) => spot.longitude);
    // Framed on the city, not on every place: Hatta and the desert sit 50+ km
    // out and would squash Dubai into a corner. They are pinned to the edge in
    // their direction instead.
    const [minLat, maxLat] = [Math.max(Math.min(...lats), CORE.minLat), Math.min(Math.max(...lats), CORE.maxLat)];
    const [minLng, maxLng] = [Math.max(Math.min(...lngs), CORE.minLng), Math.min(Math.max(...lngs), CORE.maxLng)];
    // Equirectangular, longitude shrunk by cos(latitude) so distances read true.
    const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = Math.max((maxLng - minLng) * k, 1e-6);
    const spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    const stars = located.map((spot) => ({
      spot,
      x: clamp(offX + (spot.longitude - minLng) * k * scale, PAD / 2, W - PAD / 2),
      y: clamp(H - (offY + (spot.latitude - minLat) * scale), PAD / 2, H - PAD / 2),
    }));
    // ponytail: O(n²) nearest neighbour; fine to a few hundred places, a grid index past that.
    const lines = stars.flatMap((a, i) => {
      let best = -1;
      let bestD = Infinity;
      stars.forEach((b, j) => {
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (j !== i && d < bestD) { bestD = d; best = j; }
      });
      return best > i || (best >= 0 && best < i) ? [{ key: [i, best].sort().join("-"), a, b: stars[best] }] : [];
    }).filter((line, index, all) => all.findIndex((other) => other.key === line.key) === index);
    return { stars, lines };
  }, [spots]);

  if (stars.length === 0) {
    return <p className="demo-empty">None of these places has a location yet. Switch to the grid.</p>;
  }

  return (
    <figure className="explore-sky">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${stars.length} places on a map of Dubai`}>
        {lines.map(({ key, a, b }) => (
          <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="explore-sky__line" />
        ))}
        {stars.map(({ spot, x, y }, index) => (
          <Link key={spot.id} href={`/place/${spot.id}`} className="explore-sky__star" style={{ "--i": index } as React.CSSProperties}>
            <title>{`${spot.name} · ${spot.area}`}</title>
            <circle cx={x} cy={y} r={14} className="explore-sky__hit" />
            <circle cx={x} cy={y} r={4} className="explore-sky__dot" />
            <text x={x + 10} y={y - 10} className="explore-sky__label">{spot.name}</text>
          </Link>
        ))}
      </svg>
      <figcaption>{stars.length} places, drawn where they are. Hover a star for its name; open it for everything else.</figcaption>
    </figure>
  );
}
