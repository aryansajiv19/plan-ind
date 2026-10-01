"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { centredLabel, overlaps, placeLabels, sideLabel, type Box, type Label } from "@/lib/basemap";

/** A name the map must show: beside its point, or centred above/below it. */
export interface FixedLabel {
  text: string; x: number; y: number; size: number; place: "side" | "above" | "below"; className: string;
  /** Side labels: baseline offset from the point and the gap beside it, in base px. */
  dy?: number; gap?: number;
  /** Width per character as a share of the size: 0.56 for the sans, ~0.46 for the display face. */
  perChar?: number;
}
/** Something drawn that names must keep off: a circle of radius r, which grows with the text when `grows`. */
export interface Keep { x: number; y: number; r: number; grows?: boolean }

// Every word on our maps. The SVG scales with its figure, so on a phone 12px
// of viewBox text would render at 6; this measures the figure, sizes the text
// up by k = 640 / its width (never down), and places the names at that size:
// the fixed ones (venue, station, you) always, the district names only where
// they fit clear of everything else. Sets --map-k on the figure for CSS.
/** k = viewBox width / rendered width, at least 1, for the SVG holding `ref`; also set as --map-k on its figure. */
export function useMapScale(ref: RefObject<Element | null>, w: number) {
  const [k, setK] = useState(1);
  useEffect(() => {
    const svg = ref.current instanceof SVGSVGElement ? ref.current : ref.current?.closest("svg");
    if (!svg) return;
    const figure = svg.closest("figure");
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(1, w / Math.max(entry.contentRect.width, 1));
      figure?.style.setProperty("--map-k", String(next));
      setK(next);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ref, w]);
  return k;
}

export default function MapLabels({ w, h, fixed, candidates, keep, reserveTop, maxLabels }: {
  w: number; h: number; fixed: FixedLabel[]; candidates: Label[]; keep: Keep[];
  /** A rendered-px box at the top-left that an overlay covers (the route's step caption). */
  reserveTop?: { w: number; h: number }; maxLabels?: number;
}) {
  const ref = useRef<SVGGElement>(null);
  const k = useMapScale(ref, w);

  const margin = 10 * k;
  const taken: Box[] = keep.map((c) => { const r = c.grows ? c.r * k : c.r; return { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r }; });
  if (reserveTop) taken.push({ x: 0, y: 0, w: reserveTop.w * k, h: reserveTop.h * k });

  const shown = fixed.map((f) => {
    // Scaled up for a small figure, but a big name only to 13px rendered: room beats emphasis on a phone.
    const size = k > 1 ? Math.max(13, f.size / k) * k : f.size;
    const c = f.perChar ?? 0.56;
    const tries = f.place === "side"
      ? [sideLabel(f.text, f.x, f.y + (f.dy ?? 0) * k, w, size, (f.gap ?? 14) * k, margin, c), centredLabel(f.text, f.x, f.y + 26 * k, w, size, margin, c)]
      : f.place === "above"
        ? [centredLabel(f.text, f.x, f.y - 22 * k, w, size, margin, c), sideLabel(f.text, f.x, f.y - 6 * k, w, size, 16 * k, margin, c), centredLabel(f.text, f.x, f.y + 30 * k, w, size, margin, c)]
        : [centredLabel(f.text, f.x, f.y + 24 * k, w, size, margin, c), sideLabel(f.text, f.x, f.y + 4 * k, w, size, 14 * k, margin, c), centredLabel(f.text, f.x, f.y - 16 * k, w, size, margin, c)];
    // Inside the frame and clear of everything, else at least inside the frame.
    const fits = tries.filter((t) => t.box.x >= margin && t.box.y >= margin && t.box.x + t.box.w <= w - margin && t.box.y + t.box.h <= h - margin);
    const at = fits.find((t) => !taken.some((b) => overlaps(b, t.box))) ?? fits[0] ?? tries[0];
    taken.push(at.box);
    return { ...f, ...at, size };
  });
  const districts = placeLabels(candidates, w, h, taken, { max: maxLabels, margin, size: 12 * k });

  return (
    <g ref={ref}>
      {districts.map((l) => (
        <text key={l.text} x={l.x} y={l.y} style={{ fontSize: 12 * k }}
          className={l.landmark ? "mini-map__district mini-map__district--landmark" : "mini-map__district"}>{l.text}</text>
      ))}
      {shown.map((f) => (
        <text key={f.text} x={f.x} y={f.y} textAnchor={f.anchor} style={{ fontSize: f.size }} className={f.className}>{f.text}</text>
      ))}
    </g>
  );
}
