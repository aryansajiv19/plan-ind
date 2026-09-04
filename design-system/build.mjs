// Builds the Claude Design bundle: one self-contained HTML preview per card.
//
//   node design-system/build.mjs   ->   design-system/dist/**.html
//
// Tokens are READ FROM app/globals.css at build time (see tokens.mjs), not
// copied. The previous version copied them by hand and rotted: it was still
// showing brass, Manrope and five category hues after all three had been
// retired in the app. Previews that lie are worse than no previews.
//
// Each output carries a first-line `<!-- @dsCard group="..." -->` marker,
// which is how the Design System pane builds its card index.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTokens, tokenCss } from "./tokens.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "dist");
const TOKENS = tokenCss(await readTokens());

const BASE = `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem;
  background: var(--color-paper); color: var(--color-ink);
  font-family: var(--font-body); -webkit-font-smoothing: antialiased;
}
h1,h2,h3 { font-family: var(--font-display); font-weight: 500; letter-spacing: -.02em; margin: 0; }
.kicker { font-size:.73rem; font-weight:700; letter-spacing:.18em; text-transform:uppercase;
  color: var(--color-punch); margin: 0 0 .5rem; }
.note { font-size:.86rem; color: var(--color-muted); max-width: 64ch; margin:.5rem 0 1.5rem;
  text-wrap: pretty; line-height:1.55; }
.row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; }
@media (prefers-reduced-motion: reduce) { * { animation-duration:.001ms !important; transition-duration:.001ms !important; } }
`;

const CSS = {
  swatch: `
.sw-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:.75rem; }
.sw { border:1px solid var(--color-line); border-radius: var(--radius-thumb); overflow:hidden; background:var(--color-card); }
.sw__chip { height:76px; }
.sw__meta { padding:.65rem .75rem; }
.sw__name { font-size:.82rem; font-weight:700; }
.sw__val { font-size:.72rem; color:var(--color-muted); font-variant-numeric:tabular-nums; }
.ground { padding:1.5rem; border-radius:var(--radius-panel); border:1px solid var(--color-line); }`,
  type: `
.t-row { border-top:1px solid var(--color-line); padding:1.1rem 0; display:grid;
  grid-template-columns:7rem 1fr; gap:1rem; align-items:baseline; }
.t-row > span { font-size:.72rem; color:var(--color-muted); }
.t-hero { font-family:var(--font-display); font-size:2.6rem; font-weight:500; line-height:1.04; letter-spacing:-.03em; }
.t-title { font-family:var(--font-display); font-size:1.9rem; font-weight:500; letter-spacing:-.03em; }
.t-section { font-family:var(--font-display); font-size:1.15rem; font-weight:600; letter-spacing:-.02em; }
.t-body { font-size:.9rem; } .t-small { font-size:.82rem; color:var(--color-muted); }
.t-eyebrow { font-size:.73rem; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--color-punch); }
.t-mark { font-family:var(--font-display); font-weight:700; letter-spacing:.26em; color:var(--color-punch); }`,
  btn: `
.btn { font-family:var(--font-display); font-size:.92rem; font-weight:700; padding:.9rem 2rem;
  border:1px solid transparent; border-radius:var(--radius-pill); cursor:pointer;
  background:var(--primary-fill); color:var(--primary-ink);
  transition: transform var(--dur-press) var(--ease-spring); }
.btn:active { transform: scale(.97); }
.btn--ghost { background:none; border-color:var(--color-line); color:var(--color-ink); }
.btn--small { font-size:.8rem; padding:.55rem 1.1rem; }
.btn:disabled { opacity:.42; cursor:not-allowed; }
.chip { padding:9px 16px; border-radius:22px; background:var(--color-accent-tint);
  color:var(--color-punch); font-size:.79rem; font-weight:600; border:0; cursor:pointer; }
.chip[aria-pressed="true"] { background:var(--color-punch); color:var(--primary-ink); font-weight:700; }
.live { display:flex; align-items:center; gap:9px; font-size:.82rem; color:var(--color-live); }
.live__dot { width:6px; height:6px; border-radius:50%; background:var(--color-live-dot); }`,
  wall: `
.wall { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:18px; align-items:start; }
.wall__col { display:flex; flex-direction:column; gap:18px; min-width:0; }
.tile { position:relative; overflow:hidden; border-radius:var(--radius-panel); background:var(--color-card); }
.tile__img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.tile__body { position:absolute; inset:auto 0 0 0; padding:18px; background:var(--photo-scrim); color:var(--photo-ink); }
.tile__name { font-family:var(--font-display); font-size:1.05rem; font-weight:600; letter-spacing:-.02em; color:var(--photo-ink); margin:0; }
.tile__meta { margin:2px 0 0; font-size:.76rem; color:var(--photo-body); }
.tile--typo { border:1px solid var(--color-line); }
.tile--typo .tile__body { inset:0; display:flex; flex-direction:column; justify-content:flex-end; background:none; color:var(--color-ink); }
.tile--typo .tile__name { font-size:1.45rem; color:var(--color-ink); }
.tile--typo .tile__meta { color:var(--color-muted); }
.tile__vibe { margin:10px 0 0; padding-top:10px; border-top:1px solid var(--color-line);
  font-size:.78rem; line-height:1.45; color:var(--color-muted); }
.tile__absent { position:absolute; top:14px; left:14px; margin:0; font-size:.68rem;
  letter-spacing:.14em; text-transform:uppercase; color:var(--color-muted); }
.tile__note { position:absolute; top:14px; right:14px; margin:0; padding:6px 12px; border-radius:20px;
  background:rgba(14,12,14,.6); backdrop-filter:blur(8px); color:var(--photo-ink); font-size:.72rem; font-weight:600; }
.tile__note--live { background:var(--color-punch); color:var(--primary-ink); backdrop-filter:none; }
.pin { border-radius:var(--radius-panel); border:1px solid var(--color-line); background:var(--color-card); padding:22px; }`,
  hero: `
.hero { display:grid; grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr); gap:3rem; align-items:center; }
.hero__hello { font-size:.95rem; color:var(--color-muted); margin:0 0 .45rem; }
.hero__title { font-family:var(--font-display); font-size:clamp(3rem,4.2vw,4.75rem); font-weight:500;
  line-height:.98; letter-spacing:-.03em; margin:0; }
.hero__title b { font-weight:800; position:relative; }
.hero__title b::after { content:""; position:absolute; left:2%; right:0; bottom:-.06em;
  height:.05em; background:var(--color-punch); }
.hero__deck { max-width:34rem; margin:1.9rem 0 0; font-size:1.05rem; line-height:1.5; color:var(--color-muted); }
.hero__actions { display:flex; align-items:center; gap:1rem; margin-top:2rem; }
.hero__secondary { font-size:.9rem; font-weight:600; color:var(--color-ink);
  text-decoration:underline; text-decoration-color:var(--color-punch); text-underline-offset:5px; }
.panel { border:1px solid var(--color-line); border-radius:var(--radius-hero); background:var(--color-card); padding:1.5rem; }
.panel__head { display:flex; align-items:center; gap:.625rem; font-size:.62rem; font-weight:700;
  letter-spacing:.2em; text-transform:uppercase; color:var(--color-punch); }
.panel__head::before, .panel__head::after { content:""; flex:1; height:1px;
  background:linear-gradient(to right, transparent, color-mix(in srgb, var(--color-punch) 70%, transparent)); }
.panel__head::after { background:linear-gradient(to left, transparent, color-mix(in srgb, var(--color-punch) 70%, transparent)); }
.panel__row { display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin-top:1rem; font-size:.9rem; }
.panel__row b { font-family:var(--font-display); font-weight:600; }
.plate { display:grid; place-items:center; width:2.75rem; height:2.75rem;
  border:1px solid color-mix(in srgb, var(--color-punch) 35%, transparent); color:var(--color-punch);
  font-family:var(--font-display); font-size:1.15rem; font-weight:700; font-variant-numeric:tabular-nums; }`,
};

const SW = (name, val, varName) =>
  `<div class="sw"><div class="sw__chip" style="background:var(${varName})"></div><div class="sw__meta"><div class="sw__name">${name}</div><div class="sw__val">${val}</div></div></div>`;

const TILE = ({ photo, name, meta, note, live, vibe, h }) => `
<div class="tile${photo ? "" : " tile--typo"}" style="height:${h}px">
  ${photo ? `<img class="tile__img" src="${photo}" alt="">` : ""}
  <div class="tile__body"><p class="tile__name">${name}</p><p class="tile__meta">${meta}</p>
  ${vibe ? `<p class="tile__vibe">${vibe}</p>` : ""}</div>
  ${note ? `<p class="tile__note${live ? " tile__note--live" : ""}">${note}</p>` : ""}
  ${photo ? "" : `<p class="tile__absent">No photo yet</p>`}
</div>`;

const IMG = (w, h) => `https://placehold.co/${w}x${h}/16343a/68b8c0?text=+`;

const OWNER_PALETTE_CSS = `
.op-bg { padding:2rem; border-radius:var(--radius-panel); }
.op-btn { font-family:var(--font-display); font-weight:700; padding:.85rem 1.75rem; border-radius:var(--radius-pill);
  border:1px solid transparent; font-size:.88rem; cursor:pointer; }
.op-btn--ghost { background:none; font-size:.85rem; padding:.85rem 1.5rem; border-radius:var(--radius-pill); font-family:var(--font-display); font-weight:600; cursor:pointer; }
.op-badge { display:inline-flex; align-items:center; gap:6px; padding:5px 12px; border-radius:16px; font-size:.72rem; font-weight:700; }
.op-confirm { display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:14px; font-size:.78rem; font-weight:600; }
.op-error { font-size:.78rem; font-weight:600; }
.op-card { border-radius:var(--radius-panel); padding:1.1rem; }
.op-card__name { font-family:var(--font-display); font-size:1.05rem; font-weight:600; margin:0; }
.op-card__meta { font-size:.78rem; margin:.3rem 0 0; }
`;

// Two genuinely separate palettes — v3 night (charcoal-navy/champagne-gold/
// glass-blue/teal) and a proposed white/navy day, built to match its four-job
// structure. Day's exact values are the owner's own tentative wording ("white
// and navy blue... I guess") turned into something concrete and AA-checked,
// not a guess shipped silently — flagged as proposed in the copy below.
const PALETTE = {
  night: {
    ground: "#0D1117", surface: "#161B22", ink: "#F2EFE9", muted: "#8A8F98",
    primary: "#C9A876", primaryInk: "#0D1117", secondary: "#5CC8D7",
    confirmBg: "rgba(0,224,199,.14)", confirm: "#00E0C7", error: "#FF5C5C",
    wordmark: "#C9A876", badgeBg: "rgba(92,200,215,.14)", badge: "#5CC8D7",
  },
  day: {
    ground: "#F7F7F5", surface: "#FFFFFF", ink: "#141414", muted: "#5B5F66",
    primary: "#1B2A4A", primaryInk: "#FFFFFF", secondary: "#14213D",
    confirmBg: "rgba(14,124,116,.10)", confirm: "#0E7C74", error: "#B3261E",
    wordmark: "#1B2A4A", badgeBg: "rgba(138,109,47,.10)", badge: "#8A6D2F",
  },
  // Same v3 values, ONE change: glass-blue takes the primary/wordmark job
  // instead of gold, and gold moves to where v2 always kept it — the sparing
  // badge role. Nothing else moves. This is the direct fix for "the primary
  // button and the wordmark are both gold-on-navy, which is what got
  // rejected" — proposed alongside v3-as-given so there's a real comparison,
  // not just an assertion that it helps.
  nightAlt: {
    ground: "#0D1117", surface: "#161B22", ink: "#F2EFE9", muted: "#8A8F98",
    primary: "#5CC8D7", primaryInk: "#0D1117", secondary: "#C9A876",
    confirmBg: "rgba(0,224,199,.14)", confirm: "#00E0C7", error: "#FF5C5C",
    wordmark: "#5CC8D7", badgeBg: "rgba(201,168,118,.14)", badge: "#C9A876",
  },
};

const paletteBlock = (p) => `
<div class="op-bg" style="background:${p.ground}; color:${p.ink}">
  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1.75rem">
    <p style="font-family:var(--font-display); font-weight:700; letter-spacing:.26em; color:${p.wordmark}; margin:0; font-size:.85rem">PLAN</p>
    <span class="op-badge" style="background:${p.badgeBg}; color:${p.badge}">★ 4-week streak</span>
  </div>
  <h3 style="font-family:var(--font-display); font-size:2rem; font-weight:500; letter-spacing:-.03em; margin:0 0 .5rem">Friday, 6:40 PM</h3>
  <p style="color:${p.muted}; margin:0 0 1.5rem">The group's headed to Koko Bay. Now let's make it happen.</p>
  <div class="row" style="margin-bottom:1.75rem">
    <button class="op-btn" style="background:${p.primary}; color:${p.primaryInk}">Create event</button>
    <button class="op-btn--ghost" style="border:1px solid color-mix(in srgb, ${p.ink} 22%, transparent); color:${p.ink}">Not for me</button>
  </div>
  <div class="row" style="margin-bottom:1.75rem">
    <span class="op-confirm" style="background:${p.confirmBg}; color:${p.confirm}">✓ RSVP confirmed, 4 of 6</span>
    <span class="op-error" style="color:${p.error}">2 spots left, closes in 40 min</span>
  </div>
  <div class="row" style="gap:1rem; align-items:stretch">
    <div class="op-card" style="flex:1; background:${p.surface}"><p class="op-card__name">Koko Bay</p><p class="op-card__meta" style="color:${p.muted}">Palm Jumeirah · AED 300</p></div>
    <div class="op-card" style="flex:1; background:${p.surface}"><p class="op-card__name">The Guild</p><p class="op-card__meta" style="color:${p.muted}">DIFC · AED 220</p></div>
    <div class="op-card" style="flex:1; background:${p.surface}"><p class="op-card__name">Ninive</p><p class="op-card__meta" style="color:${p.muted}">Emirates Towers · AED 250</p></div>
  </div>
</div>`;

const ownerPaletteCard = {
  path: "foundations/colour-next.html", group: "Foundations", name: "Colour — approved direction (not yet shipped)",
  subtitle: "Palette v3: charcoal-navy/gold/glass-blue by night, proposed white/navy by day",
  viewport: { width: 1280, height: 1000 }, css: OWNER_PALETTE_CSS,
  body: `<p class="kicker">Final 2026-09-04 — see design-system/SPECS.md for the full spec</p><h2>Two separately authored palettes, not one dimmed</h2>
<p class="note"><b>Day/night stays</b> — reversed back from the "one dark identity" call earlier the same day. Night is palette v3: ground <code>#0D1117</code>, surface <code>#161B22</code>, champagne gold primary <code>#C9A876</code>, glass-blue secondary <code>#5CC8D7</code>, teal confirm <code>#00E0C7</code> (small components only, unchanged constraint), error <code>#FF5C5C</code>. All AA-clear, worst case 5.82:1.</p>
<p class="note"><b>Gold-on-navy was flagged, then confirmed deliberately.</b> Champagne gold as the primary/wordmark colour on a charcoal-navy ground is structurally close to the navy-and-gold combination this whole colour pass started by rejecting. Rendered as-given next to an alternative (glass-blue primary, gold moved to the sparing badge role) before presenting either — the owner looked at both and picked gold-as-primary anyway. Settled; the alternative is kept below for the record, not as a live option.</p>
<p class="note"><b>Day is proposed, not yet confirmed</b> — "white and navy blue... I guess" turned into something concrete and contrast-checked so there's something real to react to: ground <code>#F7F7F5</code>, surface <code>#FFFFFF</code>, navy primary <code>#1B2A4A</code>, with gold/teal/error re-cut darker for AA on a light ground (day gold <code>#8A6D2F</code>, day teal <code>#0E7C74</code>, day error <code>#B3261E</code> — all clear, worst case 4.54:1). If white-and-navy meant something more specific, this is a starting point to correct, not a final answer.</p>

<div class="row" style="align-items:flex-start; gap:1.5rem">
  <div style="flex:1; min-width:420px; max-width:600px">
    <h3 style="font-size:1rem; margin-bottom:.6rem">Night — final</h3>
    ${paletteBlock(PALETTE.night)}
  </div>
  <div style="flex:1; min-width:420px; max-width:600px">
    <h3 style="font-size:1rem; margin-bottom:.6rem">Day — proposed white/navy</h3>
    ${paletteBlock(PALETTE.day)}
  </div>
</div>

<h3 style="font-size:.9rem; margin:2rem 0 .5rem; color:var(--color-muted)">For the record — the rejected alternative</h3>
<div class="row" style="align-items:flex-start; gap:1.5rem">
  <div style="flex:1; min-width:420px; max-width:600px">
    <p class="note" style="margin:0 0 .6rem">Glass-blue as primary/wordmark, gold as the sparing badge role — considered, rendered, and explicitly not chosen. Not a live option.</p>
    ${paletteBlock(PALETTE.nightAlt)}
  </div>
</div>

<p class="note" style="margin-top:1.5rem"><b>Reversed back:</b> <code>lib/dubai-phase.ts</code> (<code>dubaiHour()</code> and the ground-selection wrapper) and <code>components/ThemeSync.tsx</code> stay live — a real day palette is being added to the colour-application layer, not removed from it. The one part that stays deleted regardless of this reversal: the five retired category-group hues and the old rejected teal identity (<code>#12666e</code>/<code>#68b8c0</code>) — neither is coming back.</p>`,
};

const CARDS = [
  {
    path: "foundations/colour.html", group: "Foundations", name: "Colour",
    subtitle: "Sand and near-black grounds, teal accent, terracotta for live",
    viewport: { width: 980, height: 780 }, css: CSS.swatch,
    body: `<p class="kicker">Foundations</p><h2>Colour</h2>
<p class="note">Two separately authored palettes selected by the Dubai clock, not one dimmed. Teal replaced brass by owner decision: a warm metal on a warm ground put everything at one temperature. Terracotta means live state and nothing else. There is no category colour — the five-hue rainbow was retired; what kind of night it is comes from the photograph.</p>
<div class="ground" style="margin-bottom:1.25rem">
  <h3 style="font-size:1rem;margin-bottom:.75rem">Day — warm sand</h3>
  <div class="sw-grid">
    ${SW("paper", "ground", "--color-paper")}${SW("card", "raised surface", "--color-card")}
    ${SW("ink", "15.79:1", "--color-ink")}${SW("muted", "5.25:1", "--color-muted")}
    ${SW("accent", "5.87:1", "--color-punch")}${SW("live", "5.34:1", "--color-live")}
  </div>
</div>
<div class="ground" data-theme="night" style="background:var(--color-paper); color:var(--color-ink)">
  <h3 style="font-size:1rem;margin-bottom:.75rem">Night — warm near-black</h3>
  <div class="sw-grid">
    ${SW("paper", "ground", "--color-paper")}${SW("card", "raised surface", "--color-card")}
    ${SW("ink", "17.04:1", "--color-ink")}${SW("muted", "7.07:1", "--color-muted")}
    ${SW("accent", "8.54:1", "--color-punch")}${SW("live", "7.63:1", "--color-live")}
  </div>
</div>
<p class="note" style="margin-top:1.25rem"><b>Text over photography keeps its night values in both grounds</b> — it sits on a dark scrim either way. Headline, body and eyebrow never inherit the surface theme.</p>`,
  },
  {
    path: "foundations/type.html", group: "Foundations", name: "Type scale",
    subtitle: "Newsreader display, Hanken Grotesk body",
    viewport: { width: 940, height: 600 }, css: CSS.type,
    body: `<p class="kicker">Foundations</p><h2>Type</h2>
<p class="note">Newsreader (variable, wght 200–800) for display, Hanken Grotesk for body — two families, self-hosted. The serif replaced Manrope after Cobble came in as a reference: an editorial serif is where that warmth comes from, and it is also the sleeker of the two. Display sits at 400–600, not the 800 the handoff specified for a geometric sans — a serif's stroke contrast carries the headline and 800 goes blobby.</p>
<div class="t-row"><span>Wordmark</span><div class="t-mark">PLAN</div></div>
<div class="t-row"><span>Eyebrow</span><div class="t-eyebrow">Friday, 6:40 PM</div></div>
<div class="t-row"><span>Hero 2.6rem</span><div class="t-hero">Dubai plans, without the group chat.</div></div>
<div class="t-row"><span>Title 1.9rem</span><div class="t-title">Somewhere to put on the list</div></div>
<div class="t-row"><span>Section 1.15rem</span><div class="t-section">Tonight in Dubai</div></div>
<div class="t-row"><span>Body .9rem</span><div class="t-body">Dinner in DIFC, padel in Al Quoz, or a beach day on the Palm.</div></div>
<div class="t-row"><span>Small .82rem</span><div class="t-small">Voting closes 8:00 PM · 4 of 6 voted</div></div>`,
  },
  {
    path: "components/buttons.html", group: "Components", name: "Buttons and chips",
    subtitle: "Primary, ghost, filter chips, live indicator",
    viewport: { width: 840, height: 420 }, css: CSS.btn,
    body: `<p class="kicker">Components</p><h2>Buttons and chips</h2>
<p class="note">The primary is the one place the two grounds genuinely disagree: <b>ink by day, teal by night</b> — teal on sand is too weak to read as the main action. Press is a 200ms scale to .97, not a translate; the hard offset shadow that used to sit under these is retired, because turn 8 was rejected for exactly that.</p>
<div class="row" style="margin-bottom:1.25rem"><button class="btn">Lock it in</button><button class="btn btn--ghost">Not for me</button><button class="btn" disabled>Building three rounds…</button></div>
<div class="row" style="margin-bottom:1.25rem"><button class="chip" aria-pressed="true">Everything</button><button class="chip">Water</button><button class="chip">Dinner</button><button class="chip">After dark</button><button class="chip">Quiet</button></div>
<div class="live"><span class="live__dot"></span><span>Mo is looking at it now</span></div>
<p class="note" style="margin-top:1.5rem">The live dot is the only pulsing thing permitted, and it never means "online" — it means someone is doing something right now. Green status dots stay banned.</p>`,
  },
  {
    path: "components/wall-tile.html", group: "Components", name: "Wall tile",
    subtitle: "Photo tile, typographic tile, what-happened chips",
    viewport: { width: 940, height: 560 }, css: CSS.wall,
    body: `<p class="kicker">Components</p><h2>Wall tile</h2>
<p class="note"><b>The typographic tile is the common case, not a fallback.</b> The catalog has one nullable photo column and it is null for most rows, so a tile with no photograph renders the venue in the display serif with its vibe line — editorial rather than broken — and says plainly that a photo is missing. Chips describe what <i>happened</i>, never the category.</p>
<div class="wall" style="grid-template-columns:repeat(3,minmax(0,1fr))">
  <div class="wall__col">${TILE({ photo: IMG(1600, 900), name: "Koko Bay", meta: "Palm Jumeirah · AED 300", note: "Sara + 2 saved", h: 300 })}</div>
  <div class="wall__col">${TILE({ photo: IMG(900, 1400), name: "The Guild", meta: "DIFC · AED 220", note: "In Friday's deal", live: true, h: 300 })}</div>
  <div class="wall__col">${TILE({ name: "Al Marmoom camp", meta: "45 min out · AED 180", vibe: "Sunset tables on the sand, long menus, nobody in a rush.", h: 300 })}</div>
</div>`,
  },
  {
    path: "screens/photo-wall.html", group: "Screens", name: "Photo wall",
    subtitle: "Four staggered columns — the aesthetic rests on this",
    viewport: { width: 1180, height: 820 }, theme: "night", css: CSS.wall,
    body: `<p class="kicker">Screens</p><h2>Dubai, right now</h2>
<p class="note">Four columns, staggered top offsets (0 / 46 / 16 / 64), heights 200–360, rounded corners, no frames, <b>no tilt</b>. <code>minmax(0,1fr)</code> on the tracks and <code>min-width:0</code> on each column are load-bearing: without them an image's intrinsic ratio inflates its track and the wall overflows.</p>
<div class="wall">
  <div class="wall__col">${TILE({ photo: IMG(1600, 900), name: "Koko Bay", meta: "Palm Jumeirah · sunset 6:40", note: "Sara + 2 saved", h: 330 })}${TILE({ name: "Kite Beach", meta: "Umm Suqeim · free", vibe: "Cooler after six, always someone playing.", h: 240 })}</div>
  <div class="wall__col" style="margin-top:46px">${TILE({ photo: IMG(900, 1400), name: "The Guild", meta: "DIFC · back room seats six", h: 250 })}<div class="pin"><p class="kicker" style="margin:0 0 .5rem">Settle it</p><p style="font-family:var(--font-display);font-size:1.05rem;font-weight:600;margin:0">Beach first, or dinner first?</p></div></div>
  <div class="wall__col" style="margin-top:16px">${TILE({ name: "Al Marmoom camp", meta: "45 min out · nobody has been", vibe: "No panorama and no venue set. Twelve guest photos, last one in March.", h: 300 })}${TILE({ photo: IMG(1400, 900), name: "Sunset dhow", meta: "Marina · AED 140 each", note: "Everyone saved", live: true, h: 210 })}</div>
  <div class="wall__col" style="margin-top:64px">${TILE({ photo: IMG(1200, 1200), name: "Address rooftop", meta: "JBR · 77th floor", h: 280 })}${TILE({ name: "Al Fahidi walk", meta: "Free · cooler after 6", vibe: "Low buildings, narrow lanes, good at dusk.", h: 230 })}</div>
</div>`,
  },
  {
    path: "screens/front-door.html", group: "Screens", name: "Front door",
    subtitle: "What a signed-out visitor meets after sunset",
    viewport: { width: 1240, height: 640 }, theme: "night", css: CSS.hero + CSS.btn,
    body: `<p class="kicker">Screens</p><h2>Front door</h2>
<p class="note">The headline's last line arrives by gaining weight from 300 to 800 over 1.4s, once, then holds — the reason the display face had to be variable. The panel opposite tilts to the pointer (rotateY ±7°, rotateX ±5°): real perspective on something flat, which is the whole "3D" in the product.</p>
<div class="hero">
  <div>
    <p class="hero__hello">Still up, Dubai.</p>
    <h1 class="hero__title">Dubai plans,<br>without the<br><b>group chat.</b></h1>
    <p class="hero__deck">Dinner in DIFC, padel in Al Quoz, or a beach day on the Palm. Set the budget and distance, shortlist through three pools, and let everyone choose.</p>
    <div class="hero__actions"><button class="btn">Open a decision</button><a class="hero__secondary" href="#">Sign in to start</a></div>
  </div>
  <div class="panel">
    <div class="panel__head">Tonight in Dubai</div>
    <div class="panel__row"><span><b>Koko Bay</b> · Palm Jumeirah</span><span class="plate">4</span></div>
    <div class="panel__row"><span><b>Ninive</b> · Emirates Towers</span><span class="plate">1</span></div>
    <div class="panel__row"><span><b>The Guild</b> · DIFC</span><span class="plate">1</span></div>
    <div class="live" style="margin-top:1.25rem"><span class="live__dot"></span><span>Rana voted 2 minutes ago</span></div>
  </div>
</div>`,
  },
  ownerPaletteCard,
];

const page = (c) => `<!-- @dsCard group="${c.group}" -->
<!doctype html>
<html lang="en"${c.theme ? ` data-theme="${c.theme}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>plan-ind — ${c.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,200..800&family=Hanken+Grotesk:wght@400;500;700&display=swap">
<style>
${TOKENS}
:root { --font-display: "Newsreader", Georgia, serif; --font-body: "Hanken Grotesk", system-ui, sans-serif; }
${BASE}${c.css || ""}
</style>
</head>
<body>
${c.body}
</body>
</html>
`;

const written = [];
for (const c of CARDS) {
  const file = join(OUT, c.path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page(c), "utf8");
  written.push(c.path);
}
console.log(`wrote ${written.length} cards to design-system/dist/`);
written.forEach((p) => console.log("  " + p));
