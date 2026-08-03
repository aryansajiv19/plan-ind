"use client";

import { useEffect, useState } from "react";

/* ───────────────────────────────────────────────────────────────
   A living Dubai skyline behind the whole app.

   Drawn, not photographed: two parallax layers of inline SVG with
   the Burj Khalifa as the focal landmark, plus Burj Al Arab's sail,
   the Cayan twist and the Emirates Towers pair. The sky re-tints
   with the real clock in Asia/Dubai — never the viewer's timezone,
   because "it's night in Dubai" is the fact worth showing.

   Everything here is decoration: fixed, pointer-events-none,
   aria-hidden, and washed pale enough that body copy on top of it
   still clears WCAG AA (see globals.css for the measured palette).
   ─────────────────────────────────────────────────────────────── */

export type SkyPhase =
  | "night"
  | "predawn"
  | "dawn"
  | "morning"
  | "day"
  | "golden"
  | "dusk";

// [exclusive upper bound in Dubai decimal hours, phase]. Past the last
// bound the evening wraps back around to night.
const PHASE_BOUNDS: readonly (readonly [number, SkyPhase])[] = [
  [4.5, "night"],
  [5.75, "predawn"],
  [7.25, "dawn"],
  [10, "morning"],
  [15.75, "day"],
  [17.75, "golden"],
  [19.5, "dusk"],
] as const;

const LATE_PHASE: SkyPhase = "night";

// The server can't know the clock the browser will settle on, so it always
// renders this one. The pre-paint script below corrects the DOM before the
// first paint on a hard load; the effect keeps it honest after that.
const SSR_PHASE: SkyPhase = "day";

const BACKDROP_ID = "sky-backdrop";

function phaseForHour(t: number): SkyPhase {
  for (const [end, phase] of PHASE_BOUNDS) if (t < end) return phase;
  return LATE_PHASE;
}

// Real Dubai wall-clock time. Intl owns the DST/offset question — no
// hand-rolled UTC+4 arithmetic.
function dubaiPhase(): SkyPhase {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dubai",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date());
    let h = 0;
    let m = 0;
    for (const p of parts) {
      if (p.type === "hour") h = Number(p.value);
      else if (p.type === "minute") m = Number(p.value);
    }
    return phaseForHour(h + m / 60);
  } catch {
    return SSR_PHASE; // exotic runtime without the tz database
  }
}

// Same rule, inlined so the correct phase is on the element before the
// browser paints — otherwise a night visitor sees a flash of daylight.
const PRE_PAINT = `(function(){try{var b=${JSON.stringify(
  PHASE_BOUNDS,
)},d=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Dubai",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(new Date()),h=0,m=0,i;for(i=0;i<d.length;i++){if(d[i].type=="hour")h=+d[i].value;else if(d[i].type=="minute")m=+d[i].value}var t=h+m/60,p=${JSON.stringify(
  LATE_PHASE,
)};for(i=0;i<b.length;i++){if(t<b[i][0]){p=b[i][1];break}}var e=document.getElementById(${JSON.stringify(
  BACKDROP_ID,
)});if(e)e.setAttribute("data-phase",p)}catch(e){}})()`;

/* ── Geometry ──────────────────────────────────────────────────
   All of it is derived from a seeded PRNG at module scope, so the
   server and the browser draw byte-identical markup.            */

const VB_W = 1200;
const BASE = 400; // ground line
// Headroom above the tallest spire. `slice` crops from the top on wide,
// short windows — this gives it empty sky to eat first.
const VB_TOP = -46;
const VB_H = BASE - VB_TOP;
const VIEW_BOX = `0 ${VB_TOP} ${VB_W} ${VB_H}`;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function box(x: number, y: number, w: number, h: number): string {
  return `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z`;
}

/* Far layer: an anonymous haze of towers along the horizon. */
const FAR_PATHS: string[] = (() => {
  const rand = rng(20240117);
  const out: string[] = [];
  for (let x = -50; x < VB_W + 60; ) {
    const w = 22 + Math.round(rand() * 46);
    const h = 46 + Math.round(rand() * 104);
    out.push(box(x, BASE - h, w, h));
    if (rand() > 0.78) {
      // the odd slim antenna to break the flat top edge
      out.push(box(x + w / 2 - 1, BASE - h - 18, 2, 18));
    }
    x += w + 3 + Math.round(rand() * 18);
  }
  return out;
})();

/* The Burj: stepped setbacks spiralling into a needle spire. */
function burjKhalifa(cx: number): string[] {
  const segs: [number, number][] = [
    [58, 292],
    [47, 240],
    [39, 194],
    [31, 152],
    [24, 114],
    [18, 82],
    [13, 56],
    [8.5, 36],
    [5, 20],
  ];
  const n = segs.length;
  let d = `M${r1(cx - segs[0][0])} ${BASE}`;
  for (let i = 0; i < n; i++) {
    d += `L${r1(cx - segs[i][0])} ${segs[i][1]}`;
    if (i < n - 1) d += `L${r1(cx - segs[i + 1][0])} ${segs[i][1]}`;
  }
  d += `L${r1(cx + segs[n - 1][0])} ${segs[n - 1][1]}`;
  for (let i = n - 1; i >= 0; i--) {
    const bottom = i === 0 ? BASE : segs[i - 1][1];
    d += `L${r1(cx + segs[i][0])} ${bottom}`;
    if (i > 0) d += `L${r1(cx + segs[i - 1][0])} ${bottom}`;
  }
  return [
    d + "Z",
    `M${r1(cx - 1.8)} 20L${r1(cx + 1.8)} 20L${r1(cx)} 1Z`, // the spire
  ];
}

/* Cayan: stacked floor plates rotating up the height. */
function twistTower(
  cx: number,
  w: number,
  h: number,
  plates: number,
): string[] {
  const ph = h / plates;
  const out: string[] = [];
  for (let i = 0; i < plates; i++) {
    const t = i / (plates - 1);
    const a = t * Math.PI; // a half turn, read as a waist then a flare
    const hw = (w / 2) * (0.6 + 0.4 * Math.abs(Math.cos(a))) * (1 - t * 0.16);
    const lean = Math.sin(a) * 5;
    const y = BASE - (i + 1) * ph;
    out.push(box(cx + lean - hw, y, hw * 2, ph - 0.8));
  }
  return out;
}

/* Burj Al Arab: mast, sail, and the wing that catches the light. */
function burjAlArab(x: number): string[] {
  return [
    `M${x} ${BASE}L${x + 11} 212C${x + 13} 200 ${x + 22} 196 ${x + 30} 200` +
      `C${x + 56} 232 ${x + 76} 306 ${x + 84} ${BASE}Z`,
    `M${x + 9} 214L${x + 12} 176L${x + 14} 214Z`, // mast
  ];
}

interface Tower {
  x: number;
  w: number;
  h: number;
  kind: "flat" | "crown" | "antenna" | "dome" | "step" | "slantR" | "slantL";
}

// Left to right: a Marina-ish cluster, the sail, the twist, the Burj,
// the Emirates pair, then Business Bay tapering off.
const TOWERS: Tower[] = [
  { x: -46, w: 74, h: 108, kind: "flat" },
  { x: 36, w: 42, h: 156, kind: "antenna" },
  // Burj Al Arab occupies ~96–190
  { x: 200, w: 50, h: 128, kind: "crown" },
  // Cayan occupies ~258–316
  { x: 330, w: 62, h: 142, kind: "flat" },
  { x: 400, w: 36, h: 188, kind: "antenna" },
  { x: 444, w: 52, h: 116, kind: "step" },
  // Burj Khalifa occupies ~502–618
  { x: 628, w: 44, h: 146, kind: "dome" },
  { x: 680, w: 38, h: 194, kind: "flat" },
  { x: 730, w: 54, h: 248, kind: "slantR" },
  { x: 792, w: 48, h: 210, kind: "slantL" },
  { x: 850, w: 64, h: 134, kind: "crown" },
  { x: 922, w: 42, h: 180, kind: "antenna" },
  { x: 972, w: 70, h: 122, kind: "flat" },
  { x: 1050, w: 50, h: 164, kind: "step" },
  { x: 1108, w: 66, h: 116, kind: "flat" },
  { x: 1182, w: 54, h: 148, kind: "flat" },
];

function towerPaths(t: Tower): string[] {
  const top = BASE - t.h;
  switch (t.kind) {
    case "crown":
      return [
        box(t.x, top, t.w, t.h),
        box(t.x + t.w * 0.24, top - 12, t.w * 0.52, 12),
      ];
    case "antenna":
      return [box(t.x, top, t.w, t.h), box(t.x + t.w / 2 - 1.2, top - 30, 2.4, 30)];
    case "dome":
      return [
        box(t.x, top, t.w, t.h),
        `M${r1(t.x)} ${r1(top)}A${r1(t.w / 2)} ${r1(t.w / 2.6)} 0 0 1 ${r1(
          t.x + t.w,
        )} ${r1(top)}Z`,
      ];
    case "step":
      return [
        box(t.x, top + 26, t.w, t.h - 26),
        box(t.x + 7, top + 12, t.w - 14, 16),
        box(t.x + 15, top, t.w - 30, 14),
      ];
    case "slantR":
      return [
        `M${r1(t.x)} ${BASE}L${r1(t.x)} ${r1(top + 46)}L${r1(t.x + t.w)} ${r1(
          top,
        )}L${r1(t.x + t.w)} ${BASE}Z`,
      ];
    case "slantL":
      return [
        `M${r1(t.x)} ${BASE}L${r1(t.x)} ${r1(top)}L${r1(t.x + t.w)} ${r1(
          top + 46,
        )}L${r1(t.x + t.w)} ${BASE}Z`,
      ];
    default:
      return [box(t.x, top, t.w, t.h)];
  }
}

const NEAR_PATHS: string[] = [
  ...burjAlArab(100),
  ...twistTower(288, 56, 232, 17),
  ...burjKhalifa(560),
  ...TOWERS.flatMap(towerPaths),
];

/* Lit windows. Scattered, not gridded to death: roughly one in three
   cells is on, so at night the towers read as inhabited. */
interface Win {
  x: number;
  y: number;
}

const WINDOWS: Win[] = (() => {
  const rand = rng(90210);
  const out: Win[] = [];
  const grid = (x: number, w: number, top: number, bottom = BASE) => {
    for (let cx = x + 5; cx <= x + w - 8; cx += 11) {
      for (let cy = top + 11; cy <= bottom - 12; cy += 15) {
        if (rand() > 0.62) out.push({ x: r1(cx), y: r1(cy) });
      }
    }
  };
  for (const t of TOWERS) {
    if (t.w < 34) continue;
    grid(t.x, t.w, BASE - t.h + (t.kind === "step" ? 26 : 0));
  }
  // The Burj gets its own tapering column of light.
  const burj: [number, number, number][] = [
    [512, 96, 292],
    [524, 72, 240],
    [532, 56, 194],
    [540, 40, 152],
    [548, 26, 114],
  ];
  for (const [x, w, top] of burj) grid(x, w, top, top + 46);
  return out;
})();

/* ── Component ─────────────────────────────────────────────── */

// React warns in dev about rendered <script> tags, and the script must not
// re-run on client navigations — neutering the type on the client does both.
function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function SkylineBackdrop() {
  const [phase, setPhase] = useState<SkyPhase>(SSR_PHASE);

  useEffect(() => {
    const sync = () => setPhase(dubaiPhase());
    // Deferred one tick so the first paint keeps whatever the pre-paint
    // script put in the DOM, and so we never set state synchronously.
    const first = window.setTimeout(sync, 0);
    // Long-lived tabs drift into the next phase on their own.
    const tick = window.setInterval(sync, 120_000);
    // Timers are throttled in background tabs; re-check on return.
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <>
      <div
        id={BACKDROP_ID}
        data-phase={phase}
        aria-hidden="true"
        suppressHydrationWarning
        className="sky-root"
      >
        <div className="sky-wash" />
        <div className="sky-glow" />
        <svg
          className="sky-svg sky-far"
          viewBox={VIEW_BOX}
          preserveAspectRatio="xMidYMax slice"
          focusable="false"
        >
          {FAR_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
        <svg
          className="sky-svg sky-near"
          viewBox={VIEW_BOX}
          preserveAspectRatio="xMidYMax slice"
          focusable="false"
        >
          {NEAR_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <g className="sky-win">
            {WINDOWS.map((w, i) => (
              <rect key={i} x={w.x} y={w.y} width="3" height="4.5" />
            ))}
          </g>
        </svg>
        <div className="sky-haze" />
      </div>
      <InlineScript html={PRE_PAINT} />
    </>
  );
}
