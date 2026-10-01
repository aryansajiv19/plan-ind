// Builds lib/dubai-basemap.ts: the drawn Dubai under our maps (coast, the
// Palm and the islands, the creek and canal as the water between them, the
// motorways and trunk roads), simplified to a few hundred metres of detail.
// From OpenStreetMap via Overpass, © OpenStreetMap contributors, ODbL.
//
//   node scripts/gen-dubai-basemap.mjs              asks Overpass (3 queries)
//   node scripts/gen-dubai-basemap.mjs --from DIR   reads DIR/coast.json and
//                                                   DIR/roads.json instead
//
// Prints ok / BLOCK per check; writes nothing unless every check passes.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const BBOX = "24.95,54.95,25.36,55.50";
const UA = "plan-ind basemap (https://plan-ind.vercel.app)";
const LAND_TOL = 0.0004; // degrees, ~40 m: about 3 px at the mini-map's zoom
const ROAD_TOL = 0.0005;
const MIN_ISLAND_KM2 = 0.03; // the World's islands stay, the sandbars go

async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", headers: { "User-Agent": UA }, body: new URLSearchParams({ data: query }),
    });
    const text = await res.text();
    if (res.ok && text.startsWith("{")) return JSON.parse(text);
    await new Promise((r) => setTimeout(r, 20_000)); // rate limited: wait and retry
  }
  throw new Error("Overpass kept refusing");
}

async function load(name, query) {
  const from = process.argv.indexOf("--from");
  if (from > 0) return JSON.parse(await readFile(path.join(process.argv[from + 1], name), "utf8"));
  return overpass(query);
}

// Douglas-Peucker on [lng, lat] pairs.
function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a], [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-12;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// A ring's ends coincide, which Douglas-Peucker can't measure from: split it at
// the point farthest from the start and simplify the two halves.
function simplifyRing(ring, tol) {
  const far = ring.reduce((best, p, i) => (Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]) > Math.hypot(ring[best][0] - ring[0][0], ring[best][1] - ring[0][1]) ? i : best), 0);
  return [...simplify(ring.slice(0, far + 1), tol), ...simplify(ring.slice(far), tol).slice(1)];
}

// Join ways that share end nodes into chains; a chain that returns to its start is a ring.
function chains(ways) {
  // Joined on end coordinates: `out geom tags` carries no node ids.
  const key = (p) => `${p.lon},${p.lat}`;
  const segs = ways.map((w) => ({ nodes: w.geometry.map(key), pts: w.geometry.map((p) => [p.lon, p.lat]) }));
  const byStart = new Map(segs.map((s, i) => [s.nodes[0], i]));
  const byEnd = new Map(segs.map((s, i) => [s.nodes.at(-1), i]));
  const used = new Set();
  const out = [];
  for (let i = 0; i < segs.length; i += 1) {
    if (used.has(i)) continue;
    let head = i;
    const seen = new Set([head]);
    for (let prev = byEnd.get(segs[head].nodes[0]); prev !== undefined && !seen.has(prev) && !used.has(prev); prev = byEnd.get(segs[head].nodes[0])) {
      head = prev; seen.add(prev);
    }
    used.add(head);
    const nodes = [...segs[head].nodes], pts = [...segs[head].pts];
    for (let next = byStart.get(nodes.at(-1)); next !== undefined && !used.has(next); next = byStart.get(nodes.at(-1))) {
      used.add(next); nodes.push(...segs[next].nodes.slice(1)); pts.push(...segs[next].pts.slice(1));
    }
    out.push({ closed: nodes[0] === nodes.at(-1), pts });
  }
  return out;
}

const areaKm2 = (ring) => Math.abs(ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0) / 2) * 111 * 101;
const flat = (pts) => pts.flatMap(([lng, lat]) => [+lng.toFixed(4), +lat.toFixed(4)]);

const checks = [];
const check = (ok, what) => { checks.push(ok); console.log(`${ok ? "ok" : "BLOCK"}: ${what}`); };

const coast = await load("coast.json", `[out:json][timeout:120];way["natural"="coastline"](${BBOX});out geom;`);
const roads = await load("roads.json", `[out:json][timeout:150];way["highway"~"^(motorway|trunk)$"](${BBOX});out geom tags;`);

const coastChains = chains(coast.elements);
const open = coastChains.filter((c) => !c.closed);
check(open.length === 1, `one mainland coast chain (found ${open.length})`);
// OSM coastlines keep land on the left: this one runs north-east to south-west,
// so the land is to the south-east. Close it round that side, well outside the box.
const main = open[0].pts;
const [first, last] = [main[0], main.at(-1)];
check(first[1] > last[1] && first[0] > last[0], "mainland runs north-east to south-west");
const mainland = [...simplify(main, LAND_TOL), [last[0], 24.7], [55.8, 24.7], [55.8, 25.6], [first[0], 25.6]];
const islands = coastChains.filter((c) => c.closed && areaKm2(c.pts) >= MIN_ISLAND_KM2).map((c) => simplifyRing(c.pts, LAND_TOL));
const centre = (r) => r.reduce(([x, y], p) => [x + p[0] / r.length, y + p[1] / r.length], [0, 0]);
check(islands.some((r) => areaKm2(r) > 4 && Math.hypot(centre(r)[0] - 55.134, centre(r)[1] - 25.118) < 0.02), "the Palm Jumeirah is among the islands");

// Roads: every motorway and trunk way, joined per name/ref where they meet.
const roadWays = roads.elements.filter((w) => w.geometry?.length > 1);
const roadChains = chains(roadWays).map((c) => simplify(c.pts, ROAD_TOL)).filter((pts) => pts.length > 1);
check(roadChains.length > 20, `major roads (${roadChains.length} runs)`);

const land = [mainland, ...islands];
const points = land.reduce((n, r) => n + r.length, 0) + roadChains.reduce((n, r) => n + r.length, 0);
const body = `// Generated by scripts/gen-dubai-basemap.mjs; do not hand-edit.
// From OpenStreetMap via Overpass, © OpenStreetMap contributors, ODbL.
// Coordinates are flat [lng, lat, lng, lat, ...] at 4 decimals (~11 m).

/** Land: the mainland (closed round its inland side) and the islands. Water is what's left. */
export const LAND: readonly (readonly number[])[] = ${JSON.stringify(land.map(flat))};

/** Motorways and trunk roads, as polylines. */
export const ROADS: readonly (readonly number[])[] = ${JSON.stringify(roadChains.map(flat))};
`;
check(body.length < 90_000, `file size ${(body.length / 1024).toFixed(1)} KB, ${points} points`);
if (checks.every(Boolean)) {
  await writeFile(path.join(root, "lib/dubai-basemap-data.ts"), body);
  console.log("wrote lib/dubai-basemap-data.ts");
} else {
  process.exitCode = 1;
}
