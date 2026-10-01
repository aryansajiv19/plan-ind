// The drawn Dubai under our maps: land and water, the major roads, district
// names and the Burj Khalifa, projected into whatever frame a map uses and
// clipped to it, so a 640-wide SVG carries only the few hundred points it
// shows. Geometry: lib/dubai-basemap-data.ts (OSM, ODbL). Pure: no React.
import { LAND, ROADS } from "./dubai-basemap-data.ts";

export type Project = (lng: number, lat: number) => [number, number];
export interface Box { x: number; y: number; w: number; h: number }
export interface Label { text: string; x: number; y: number; landmark?: boolean }

/**
 * Neighbourhood names a map may print, at their centres (no hotels or malls).
 * The centres are lib/dubai-areas' (AREA_CENTRES or DUBAI_ORIGINS); JLT, DIFC
 * and Meydan, which it lacks, are read off the OSM map.
 */
export const DISTRICTS: readonly { name: string; lat: number; lng: number }[] = [
  { name: "Al Barsha", lat: 25.11, lng: 55.2 }, { name: "Al Quoz", lat: 25.135, lng: 55.235 },
  { name: "Al Karama", lat: 25.244, lng: 55.304 }, { name: "Al Satwa", lat: 25.229, lng: 55.27 },
  { name: "Al Wasl", lat: 25.205, lng: 55.257 }, { name: "Jumeirah", lat: 25.204, lng: 55.238 },
  { name: "Umm Suqeim", lat: 25.154, lng: 55.205 }, { name: "Dubai Marina", lat: 25.08, lng: 55.14 },
  { name: "JLT", lat: 25.07, lng: 55.145 }, { name: "Palm Jumeirah", lat: 25.112, lng: 55.139 },
  { name: "Downtown", lat: 25.197, lng: 55.274 }, { name: "Business Bay", lat: 25.186, lng: 55.271 },
  { name: "DIFC", lat: 25.212, lng: 55.282 }, { name: "Bur Dubai", lat: 25.258, lng: 55.294 },
  { name: "Deira", lat: 25.27, lng: 55.315 }, { name: "Al Garhoud", lat: 25.24, lng: 55.35 },
  { name: "Festival City", lat: 25.223, lng: 55.35 }, { name: "Dubai Hills", lat: 25.113, lng: 55.249 },
  { name: "Al Nahda", lat: 25.29, lng: 55.367 }, { name: "Mirdif", lat: 25.22, lng: 55.42 },
  { name: "Silicon Oasis", lat: 25.12, lng: 55.38 }, { name: "JVC", lat: 25.06, lng: 55.21 },
  { name: "Motor City", lat: 25.047, lng: 55.238 }, { name: "Meydan", lat: 25.16, lng: 55.3 },
];
/** The Burj Khalifa's footprint centre (OSM way 27581578's centre). */
export const BURJ_KHALIFA = { lat: 25.1970352, lng: 55.2742132 };

const round = (n: number) => Math.round(n * 10) / 10;

/** Sutherland-Hodgman: a polygon clipped to the rectangle [x0,x1]x[y0,y1]. */
export function clipPolygon(points: [number, number][], x0: number, y0: number, x1: number, y1: number): [number, number][] {
  let out = points;
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    input.forEach((p, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(p)) {
        if (!inside(prev)) out.push(cross(prev, p));
        out.push(p);
      } else if (inside(prev)) out.push(cross(prev, p));
    });
    if (out.length === 0) break;
  }
  return out;
}

const projected = (flat: readonly number[], project: Project) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(project(flat[i], flat[i + 1]));
  return pts;
};

/** One SVG path of every piece of land in the frame (with a margin, so edges never show). */
export function landPath(project: Project, w: number, h: number, pad = 12): string {
  return LAND.map((ring) => clipPolygon(projected(ring, project), -pad, -pad, w + pad, h + pad))
    .filter((poly) => poly.length > 2)
    .map((poly) => `M${poly.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}Z`)
    .join("");
}

/** One SVG path of the road runs that cross the frame. */
export function roadPath(project: Project, w: number, h: number, pad = 12): string {
  const inBox = (a: [number, number], b: [number, number]) =>
    Math.max(a[0], b[0]) >= -pad && Math.min(a[0], b[0]) <= w + pad && Math.max(a[1], b[1]) >= -pad && Math.min(a[1], b[1]) <= h + pad;
  const runs: [number, number][][] = [];
  for (const road of ROADS) {
    const pts = projected(road, project);
    let run: [number, number][] = [];
    for (let i = 1; i < pts.length; i += 1) {
      if (inBox(pts[i - 1], pts[i])) {
        if (run.length === 0) run.push(pts[i - 1]);
        run.push(pts[i]);
      } else if (run.length) { runs.push(run); run = []; }
    }
    if (run.length) runs.push(run);
  }
  return runs.map((run) => `M${run.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}`).join("");
}

/** A label's box: uppercase with letter spacing runs ~0.66 of the font size a character. */
export const labelBox = (text: string, x: number, y: number, size = 12): Box => {
  const w = text.length * size * 0.66;
  return { x: x - w / 2, y: y - size, w, h: size + 4 };
};
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where the landmark and district names would go, the landmark first, then nearest the centre. */
export function labelCandidates(project: Project, w: number, h: number): Label[] {
  const [bx, by] = project(BURJ_KHALIFA.lng, BURJ_KHALIFA.lat);
  return [
    { text: "Burj Khalifa", x: bx, y: by - 22, landmark: true },
    ...DISTRICTS.map((d) => { const [x, y] = project(d.lng, d.lat); return { text: d.name, x, y }; })
      .sort((a, b) => Math.hypot(a.x - w / 2, a.y - h / 2) - Math.hypot(b.x - w / 2, b.y - h / 2)),
  ].filter((l) => l.x > -w && l.x < 2 * w && l.y > -h && l.y < 2 * h);
}

/**
 * The candidates that fit at `size`: inside the frame by `margin`, clear of
 * every box in `avoid` (the pin, the fixed names, the stations) and of each
 * other. A label that would collide is dropped, not squeezed.
 */
export function placeLabels(candidates: Label[], w: number, h: number, avoid: Box[], { max = 8, margin = 10, size = 12 } = {}): Label[] {
  const taken = [...avoid];
  const placed: Label[] = [];
  for (const label of candidates) {
    if (placed.length >= max) break;
    const box = labelBox(label.text, label.x, label.y, size);
    const inside = box.x >= margin && box.y >= margin && box.x + box.w <= w - margin && box.y + box.h <= h - margin;
    if (!inside || taken.some((t) => overlaps(t, box))) continue;
    taken.push(box);
    placed.push(label);
  }
  return placed;
}

/** A name beside a point, kept inside the frame: right of it, else left, else centred and clamped. */
export function sideLabel(text: string, x: number, y: number, w: number, size: number, gap = 14, margin = 10, perChar = 0.56) {
  const width = text.length * size * perChar;
  const right = x + gap + width <= w - margin;
  const left = x - gap - width >= margin;
  const anchor: "start" | "end" | "middle" = right ? "start" : left ? "end" : "middle";
  const tx = anchor === "start" ? x + gap : anchor === "end" ? x - gap : Math.min(Math.max(x, width / 2 + margin), w - width / 2 - margin);
  const box: Box = { x: anchor === "start" ? tx : anchor === "end" ? tx - width : tx - width / 2, y: y - size, w: width, h: size + 4 };
  return { x: tx, y, anchor, box };
}

/** A name centred on a point (above or below it), clamped inside the frame. */
export function centredLabel(text: string, x: number, y: number, w: number, size: number, margin = 10, perChar = 0.56) {
  const width = text.length * size * perChar;
  const tx = Math.min(Math.max(x, width / 2 + margin), w - width / 2 - margin);
  return { x: tx, y, anchor: "middle" as const, box: { x: tx - width / 2, y: y - size, w: width, h: size + 4 } };
}
