"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AREA_CENTRES, type Coordinates } from "@/lib/dubai-areas";
import { METRO_LINES } from "@/lib/metro-lines";
import { journey, type JourneyMode, type Leg, type Pt } from "@/lib/route-journey";
import type { MappableVenue } from "@/lib/directions";

// Our own route map: the way from you to the venue draws itself leg by leg
// (walk dashed, metro in its line colour, drive solid), a marker travels it,
// and a numbered note lands at each point that matters. Replay runs it again.
// Themed through the same --map-* values as the mini-map. Under reduced
// motion the whole route is simply shown.
const W = 640;
const H = 420;
const LINE = { Red: "#e25c5c", Green: "#4caf7d" } as const;

type Venue = MappableVenue & { parking?: string | null };

export default function RouteJourney({ venue, origin, mode }: { venue: Venue; origin: Coordinates; mode: JourneyMode }) {
  const uid = useId().replace(/:/g, "");
  const [run, setRun] = useState(0);
  // The step the marker is on; null before it starts and under reduced motion.
  const [active, setActive] = useState<number | null>(null);
  const motion = useRef<SVGAnimateMotionElement>(null);
  // Keyed on values, not objects: a parent re-render must not restart the run.
  const { latitude: oLat, longitude: oLng } = origin;
  const { latitude: vLat, longitude: vLng, parking } = venue;
  const j = useMemo(
    () => journey({ latitude: oLat, longitude: oLng }, { latitude: vLat, longitude: vLng, parking }, mode),
    [oLat, oLng, vLat, vLng, parking, mode],
  );
  const plan = useMemo(() => (j ? stepTimes(j.legs) : null), [j]);

  useEffect(() => {
    if (!plan || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    motion.current?.beginElement();
    const timers = [window.setTimeout(() => setActive(null), 0), ...plan.starts.map((at, i) => window.setTimeout(() => setActive(i), at * 1000 + 1))];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [run, plan]);

  if (!j || venue.latitude == null || venue.longitude == null) return null;
  const to: Pt = { lat: venue.latitude, lng: venue.longitude };
  const from: Pt = { lat: origin.latitude, lng: origin.longitude };

  // Frame every point on the route, padded, at a true aspect for Dubai's latitude.
  const all = [from, to, ...j.legs.flatMap((l) => l.points)];
  const k = Math.cos((to.lat * Math.PI) / 180);
  const [minLat, maxLat] = [Math.min(...all.map((p) => p.lat)), Math.max(...all.map((p) => p.lat))];
  const [minLng, maxLng] = [Math.min(...all.map((p) => p.lng)), Math.max(...all.map((p) => p.lng))];
  const cLat = (minLat + maxLat) / 2;
  const cLng = (minLng + maxLng) / 2;
  const spanY = Math.max(maxLat - minLat, 0.012);
  const spanX = Math.max((maxLng - minLng) * k, 0.012);
  const s = Math.min((W * 0.72) / spanX, (H * 0.68) / spanY);
  const x = (p: Pt) => W / 2 + (p.lng - cLng) * k * s;
  const y = (p: Pt) => H / 2 - (p.lat - cLat) * s;
  const inFrame = (p: Pt) => x(p) > 24 && x(p) < W - 24 && y(p) > 18 && y(p) < H - 18;

  // Each drawn leg as a path segment continuing from the previous one.
  const drawn = j.legs.filter((l) => l.points.length > 1);
  const segment = (l: Leg) => {
    const [a, b] = [l.points[0], l.points.at(-1)!];
    if (!l.curved) return l.points.slice(1).map((p) => `L${x(p).toFixed(1)} ${y(p).toFixed(1)}`).join(" ");
    const [ax, ay, bx, by] = [x(a), y(a), x(b), y(b)];
    const bend = 0.18;
    const cx = (ax + bx) / 2 - (by - ay) * bend;
    const cy = (ay + by) / 2 + (bx - ax) * bend;
    return `Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
  };
  const start = (l: Leg) => `M${x(l.points[0]).toFixed(1)} ${y(l.points[0]).toFixed(1)}`;
  const seconds = plan!.seconds;
  const timing = drawn.map((l) => plan!.timing[j.legs.indexOf(l)]);
  const whole = drawn.length ? `${start(drawn[0])} ${drawn.map(segment).join(" ")}` : "";

  // Area names that fall in the frame, for a map you can read.
  const areas = Object.entries(AREA_CENTRES)
    .map(([name, c]) => ({ name, p: { lat: c.latitude, lng: c.longitude } }))
    .filter((a) => inFrame(a.p) && all.every((p) => Math.hypot(x(p) - x(a.p), y(p) - y(a.p)) > 46))
    .slice(0, 12);
  const noteDelay = (i: number) => plan!.starts[i];
  // A mode switch can shorten the route before the timers catch up.
  const current = active !== null ? j.legs[active] : undefined;

  return (
    <figure className="mini-map route-journey">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Route to ${venue.name}: ${j.legs.map((l) => l.note).join("; ")}`}>
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`g${i}`} x1={(i + 1) * (W / 10)} y1="0" x2={(i + 1) * (W / 10)} y2={H} className="mini-map__grid" />
        ))}
        {areas.map((a) => (
          <text key={a.name} x={x(a.p)} y={y(a.p)} className="route-journey__area">{a.name.replace(/\b\w/g, (c) => c.toUpperCase())}</text>
        ))}
        {METRO_LINES.map((line) => (
          <polyline key={line.key} points={line.stations.map((st) => `${x({ lat: st.lat, lng: st.lng }).toFixed(1)},${y({ lat: st.lat, lng: st.lng }).toFixed(1)}`).join(" ")}
            fill="none" stroke={LINE[line.color]} strokeWidth="3" strokeLinejoin="round" className="route-journey__network" />
        ))}

        <g key={run}>
          <defs>
            {drawn.map((l, i) => (
              <mask key={i} id={`${uid}-m${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
                <path d={`${start(l)} ${segment(l)}`} pathLength={1} className="route-journey__reveal"
                  style={{ animationDelay: `${timing[i].delay}s`, animationDuration: `${timing[i].dur}s` }} />
              </mask>
            ))}
          </defs>
          {drawn.map((l, i) => (
            <path key={i} d={`${start(l)} ${segment(l)}`} mask={`url(#${uid}-m${i})`}
              className={`route-journey__leg route-journey__leg--${l.kind}`}
              style={l.line ? { stroke: LINE[l.line] } : undefined} />
          ))}
          {drawn.filter((l) => l.kind === "metro").flatMap((l) => l.points).map((p, i) => (
            <circle key={i} cx={x(p)} cy={y(p)} r="3.5" className="mini-map__station" />
          ))}
          {j.legs.map((l, i) => (
            <g key={i} className="route-journey__note" data-active={active === i || undefined} style={{ animationDelay: `${noteDelay(i)}s` }}>
              <circle cx={x(l.noteAt)} cy={y(l.noteAt)} r="11" className="route-journey__badge" />
              <text x={x(l.noteAt)} y={y(l.noteAt) + 4} textAnchor="middle" className="route-journey__badge-text">{i + 1}</text>
            </g>
          ))}
          <circle r="6" className="route-journey__traveller">
            <animateMotion ref={motion} dur={`${seconds}s`} begin="indefinite" fill="freeze" calcMode="paced" path={whole} />
          </circle>
        </g>

        <circle cx={x(from)} cy={y(from)} r="7" className="route-journey__you" />
        <text x={x(from)} y={y(from) + 24} textAnchor="middle" className="mini-map__label">You</text>
        <path d={`M${x(to)} ${y(to) + 2} l-9 -15 a10.5 10.5 0 1 1 18 0 z`} className="mini-map__pin" />
        <text x={x(to)} y={y(to) - 22} textAnchor="middle" className="mini-map__label mini-map__label--venue">{venue.name}</text>
      </svg>
      {current && (
        <p className="route-journey__now" aria-live="polite">
          <span>{active! + 1}</span>
          {current.note}
        </p>
      )}
      <figcaption className="route-journey__caption">
        <span>{j.summary}</span>
        <button type="button" onClick={() => { setActive(null); setRun((n) => n + 1); }} className="route-journey__replay">Replay</button>
      </figcaption>
      <ol className="route-journey__steps">
        {j.legs.map((l, i) => <li key={i} aria-current={active === i ? "step" : undefined}>{l.note}</li>)}
      </ol>
    </figure>
  );
}

/**
 * The run's pacing from true ground distance (longitude scaled for Dubai's
 * latitude), so the drawing, the marker and the caption stay in step: each
 * drawn leg's start and duration in seconds; a leg with nothing to draw (the
 * parking note) begins as the run ends.
 */
function stepTimes(legs: Leg[]) {
  const k = Math.cos((25.2 * Math.PI) / 180);
  const len = (l: Leg) =>
    l.points.slice(1).reduce((n, p, i) => n + Math.hypot((p.lng - l.points[i].lng) * k, p.lat - l.points[i].lat), 0) * (l.curved ? 1.08 : 1);
  const lengths = legs.map(len);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const drawnCount = legs.filter((l) => l.points.length > 1).length;
  const seconds = Math.min(6, Math.max(3, 2 + drawnCount * 0.8));
  const timing = lengths.map((l, i) => ({
    delay: (lengths.slice(0, i).reduce((a, b) => a + b, 0) / total) * seconds,
    dur: (l / total) * seconds,
  }));
  return { seconds, timing, starts: timing.map((t, i) => (legs[i].points.length > 1 ? t.delay : seconds)) };
}
