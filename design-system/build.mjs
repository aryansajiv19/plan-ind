// Builds the Claude Design bundle: one self-contained HTML preview per card.
//
// Every token here is lifted verbatim from app/globals.css @theme and the
// .home-experience--night scope. Previews are generated rather than
// hand-written so a token change regenerates all of them instead of drifting
// across nine copies.
//
//   node design-system/build.mjs   ->   design-system/dist/**.html
//
// Each output carries a first-line `<!-- @dsCard group="..." -->` marker,
// which is how the Design System pane builds its card index.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "dist");

const TOKENS = `
:root {
  --color-paper: #f3f1ec;
  --color-card:  #fbfaf7;
  --color-ink:   #17181b;
  --color-muted: #66666b;
  --color-line:  rgba(23, 24, 27, 0.14);
  --color-punch: #9b7d4e;       /* champagne — display/large only, 3.37:1 */
  --color-punch-text: #7a6038;  /* champagne — small text, 5.23:1 */
  --color-live:  #2f4bd6;       /* state accent: you, and now. 6.00:1 */
  --color-group-food:    #a83a20; /* 5.65:1 */
  --color-group-night:   #b3175f; /* 5.81:1 */
  --color-group-water:   #0f6a72; /* 5.60:1 */
  --color-group-active:  #2a6b3c; /* 5.69:1 */
  --color-group-leisure: #6b46b0; /* 5.95:1 */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-settle: cubic-bezier(0.16, 1, 0.3, 1);
  --font-display: "Manrope", system-ui, sans-serif;
  --font-body: "Hanken Grotesk", system-ui, sans-serif;
}
[data-theme="night"] {
  --color-paper: #090b0e;
  --color-card:  #121418;
  --color-ink:   #f0ece4;
  --color-muted: #9d9b99;
  --color-line:  rgba(240, 236, 228, 0.14);
  --color-punch: #c3a573;
  --color-punch-text: #c3a573;  /* 7.86:1 — no darker cut needed */
  --color-live:  #8aa0ff;       /* 8.02:1; day cobalt is 2.91:1 here */
  --color-group-food:    #e0865f; /* 6.80:1 */
  --color-group-night:   #dd7a9c; /* 6.44:1 */
  --color-group-water:   #5fb0bb; /* 7.39:1 */
  --color-group-active:  #72b083; /* 7.25:1 */
  --color-group-leisure: #a893e8; /* 7.03:1 */
  color-scheme: dark;
}
[data-group="food"]    { --group: var(--color-group-food); }
[data-group="night"]   { --group: var(--color-group-night); }
[data-group="water"]   { --group: var(--color-group-water); }
[data-group="active"]  { --group: var(--color-group-active); }
[data-group="leisure"] { --group: var(--color-group-leisure); }
`;

const BASE = `
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem;
  background: var(--color-paper); color: var(--color-ink);
  font-family: var(--font-body); -webkit-font-smoothing: antialiased;
}
h1,h2,h3 { font-family: var(--font-display); letter-spacing: -0.02em; margin: 0; }
.kicker {
  font-size: .68rem; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase; color: var(--color-punch-text); margin: 0 0 .5rem;
}
.stack { display: flex; flex-direction: column; gap: 1.25rem; }
.row { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
.label { font-size: .72rem; color: var(--color-muted); }
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
`;

// Shared component CSS, split so each card ships only what it needs.
const CSS = {
  swatch: `
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px,1fr)); gap: .75rem; }
.sw { border: 1px solid var(--color-line); background: var(--color-card); }
.sw__chip { height: 72px; }
.sw__meta { padding: .6rem .7rem; }
.sw__name { font-size: .8rem; font-weight: 700; }
.sw__val { font-size: .72rem; color: var(--color-muted); font-variant-numeric: tabular-nums; }`,
  type: `
.type-row { border-top: 1px solid var(--color-line); padding: 1rem 0; display: grid; grid-template-columns: 7rem 1fr; gap: 1rem; align-items: baseline; }
.type-row span { font-size: .72rem; color: var(--color-muted); }
.t-hero { font-family: var(--font-display); font-size: clamp(2.4rem,6vw,4rem); font-weight: 800; line-height: .96; letter-spacing: -.03em; }
.t-title { font-family: var(--font-display); font-size: 2rem; font-weight: 800; }
.t-section { font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; }
.t-body { font-size: 1rem; }
.t-small { font-size: .82rem; color: var(--color-muted); }`,
  btn: `
.btn { font-family: var(--font-body); font-size: .95rem; font-weight: 700; padding: .85rem 1.5rem;
  border: 1px solid var(--color-ink); background: var(--color-ink); color: var(--color-paper); cursor: pointer;
  transition: transform 260ms var(--ease-spring), opacity 150ms ease; }
.btn:active { transform: translateY(1px) scale(.98); transition-duration: 90ms; transition-timing-function: ease-out; }
.btn--ghost { background: transparent; color: var(--color-ink); }
.btn--small { font-size: .8rem; padding: .5rem .9rem; font-weight: 500; }
.btn:disabled { opacity: .42; cursor: not-allowed; }`,
  groups: `
.groups { display: flex; gap: .25rem; border-bottom: 1px solid var(--color-line); flex-wrap: wrap; }
.group-tab { position: relative; font-family: var(--font-body); font-size: .85rem; padding: .7rem 1rem;
  min-height: 44px; background: none; border: 0; color: var(--color-muted); cursor: pointer; }
.group-tab[aria-selected="true"] { color: var(--color-ink); font-weight: 700; }
.group-tab::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:3px;
  background: var(--group, var(--color-ink)); transform: scaleX(0); transform-origin: left center;
  transition: transform 220ms var(--ease-settle); }
.group-tab[aria-selected="true"]::after { transform: scaleX(1); }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px,1fr)); gap: .6rem; margin-top: 1rem; }
.tile { font-family: var(--font-body); font-size: .95rem; font-weight: 700; padding: 1.15rem 1rem;
  min-height: 56px; cursor: pointer; text-align: center; border: 1px solid var(--color-line);
  background: var(--color-card); color: var(--color-ink);
  transition: border-color 150ms, background 150ms, transform 300ms var(--ease-spring); }
.tile[aria-pressed="true"] { border-color: var(--group); transform: scale(1.025);
  background: color-mix(in srgb, var(--group) 12%, transparent); box-shadow: inset 3px 0 0 var(--group); }
.tile:active { transform: scale(.94); transition-duration: 90ms; }`,
  opt: `
.opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: .75rem; }
.opt { position: relative; display: flex; flex-direction: column; gap: .35rem; padding: 1rem;
  text-align: left; cursor: pointer; border: 1px solid var(--color-line);
  background: var(--color-card); color: var(--color-ink);
  transition: border-color 150ms, background 150ms, transform 320ms var(--ease-spring), opacity 150ms; }
.opt__cat { font-size:.62rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color: var(--group, var(--color-punch-text)); }
.opt__name { font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; }
.opt__meta { font-size:.8rem; color: var(--color-muted); }
.opt__votes { font-size:.78rem; color: var(--color-punch-text); font-variant-numeric: tabular-nums; margin-top:.4rem; }
.opt[aria-pressed="true"] { border-color: var(--color-live); transform: translateY(-2px) scale(1.008); }
.opt[aria-pressed="true"] .opt__votes { color: var(--color-live); font-weight: 700; }
.opt--winner { border-color: var(--color-punch); border-width: 2px; }
.opt__win { font-size:.6rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color: var(--color-punch-text); }
.opt--dim { opacity: .55; }
.opt:active { transform: scale(.975); transition-duration: 90ms; transition-timing-function: ease-out; }`,
  dots: `
.dots { display: flex; gap: .5rem; }
.dot { width:44px; height:44px; border-radius:50%; cursor:pointer; border:1px solid var(--color-line);
  background: var(--color-card); color: var(--color-muted); font-family: var(--font-body);
  font-size:.8rem; font-variant-numeric: tabular-nums;
  transition: transform 300ms var(--ease-spring), border-color 160ms, background 160ms, color 160ms; }
.dot[data-complete="true"] { border-color: var(--color-live); color: var(--color-live); }
.dot[aria-current="step"] { transform: scale(1.06); border-color: var(--color-ink); color: var(--color-ink); font-weight: 700; }`,
  place: `
.places { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px,1fr)); gap: .9rem; }
.place { border: 1px solid var(--color-line); background: var(--color-card); border-top: 3px solid var(--group, var(--color-line)); }
.place__code { height: 132px; display: grid; place-items: center; font-family: var(--font-display);
  font-size: 1.6rem; font-weight: 800; letter-spacing: .06em;
  background: color-mix(in srgb, var(--group, var(--color-ink)) 14%, var(--color-card)); color: var(--group, var(--color-ink)); }
.place__body { padding: .85rem .9rem 1rem; }
.place__cat { font-size:.62rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color: var(--group, var(--color-punch-text)); }
.place__name { font-family: var(--font-display); font-size: 1.05rem; font-weight: 800; margin-top:.2rem; }
.place__meta { font-size:.8rem; color: var(--color-muted); }
.place__note { margin-top:.6rem; padding-top:.6rem; border-top: 2px solid color-mix(in srgb, var(--group, var(--color-line)) 40%, transparent); font-size:.78rem; color: var(--color-muted); }`,
  panel: `
.panel { border: 1px solid var(--color-line); background: var(--color-card); padding: 1.5rem; }
.stats { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid var(--color-line); margin-top: 1.25rem; }
.stat { padding:.9rem; text-align:center; border-right: 1px solid var(--color-line); }
.stat:last-child { border-right: 0; }
.stat b { display:block; font-family: var(--font-display); font-size:1.5rem; font-weight:800; }
.stat span { font-size:.62rem; letter-spacing:.12em; text-transform:uppercase; color: var(--color-muted); }`,
};

const SWATCH = (name, val, varName, group) =>
  `<div class="sw"${group ? ` data-group="${group}"` : ""}><div class="sw__chip" style="background:var(${varName});${varName === "--color-paper" || varName === "--color-card" ? "border-bottom:1px solid var(--color-line)" : ""}"></div><div class="sw__meta"><div class="sw__name">${name}</div><div class="sw__val">${val}</div></div></div>`;

const CARDS = [
  {
    path: "foundations/colour.html", group: "Foundations", name: "Colour",
    subtitle: "Base, accents and five category hues, day + night", viewport: { width: 900, height: 620 },
    css: CSS.swatch,
    body: `<p class="kicker">Foundations</p><h2>Colour</h2>
<p class="label" style="max-width:60ch;margin:.5rem 0 1.25rem">Ivory and graphite base, champagne for outcomes, one cobalt state accent, five category-group hues. Day and night are separate systems, not a filter — every value is theme-scoped. Ratios measured against the darker ground in each theme.</p>
<div class="swatches">
${SWATCH("paper", "ground", "--color-paper")}
${SWATCH("card", "raised surface", "--color-card")}
${SWATCH("ink", "text and rules", "--color-ink")}
${SWATCH("champagne", "the outcome · 3.37:1 large only", "--color-punch")}
${SWATCH("champagne text", "small text · 5.23:1", "--color-punch-text")}
${SWATCH("live", "you, and now · 6.00:1", "--color-live")}
</div>
<h3 style="font-size:1rem;margin:1.75rem 0 .75rem">Category groups</h3>
<div class="swatches">
${SWATCH("Food &amp; drink", "paprika · 5.65:1", "--group", "food")}
${SWATCH("After dark", "lit magenta · 5.81:1", "--group", "night")}
${SWATCH("Sun &amp; water", "marine teal · 5.60:1", "--group", "water")}
${SWATCH("Move and play", "pitch green · 5.69:1", "--group", "active")}
${SWATCH("Culture &amp; reset", "gallery violet · 5.95:1", "--group", "leisure")}
</div>`,
  },
  {
    path: "foundations/type.html", group: "Foundations", name: "Type scale",
    subtitle: "Manrope display, Hanken Grotesk body", viewport: { width: 900, height: 520 },
    css: CSS.type,
    body: `<p class="kicker">Foundations</p><h2>Type</h2>
<p class="label" style="margin:.5rem 0 1rem">Manrope for display, Hanken Grotesk for body. Both self-hosted in the app.</p>
<div class="type-row"><span>Hero</span><div class="t-hero">Dubai plans, without the group chat.</div></div>
<div class="type-row"><span>Title</span><div class="t-title">What does the group feel like doing?</div></div>
<div class="type-row"><span>Section</span><div class="t-section">Tonight in DIFC</div></div>
<div class="type-row"><span>Body</span><div class="t-body">Dinner in DIFC, padel in Al Quoz, or a beach day on the Palm.</div></div>
<div class="type-row"><span>Small</span><div class="t-small">Voting closes 8:00 PM · 4 of 6 voted</div></div>`,
  },
  {
    path: "components/buttons.html", group: "Components", name: "Buttons",
    subtitle: "Primary, ghost, small, disabled", viewport: { width: 760, height: 300 },
    css: CSS.btn,
    body: `<p class="kicker">Components</p><h2>Buttons</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Press feedback is asymmetric: 90ms ease-out down, spring back up. Hover transforms are cancelled in the shipped build.</p>
<div class="stack">
<div class="row"><button class="btn">Deal 9 places in 3 rounds</button><button class="btn btn--ghost">See a sample vote</button></div>
<div class="row"><button class="btn btn--small">Coming</button><button class="btn btn--small btn--ghost">Maybe</button><button class="btn btn--small btn--ghost">Can't make it</button></div>
<div class="row"><button class="btn" disabled>Building three rounds…</button></div>
</div>`,
  },
  {
    path: "components/category-groups.html", group: "Components", name: "Category groups",
    subtitle: "Five tabs, each carrying a hue; live", viewport: { width: 900, height: 400 },
    css: CSS.groups,
    body: `<p class="kicker">Components</p><h2>Category groups</h2>
<p class="label" style="margin:.5rem 0 1.25rem">The group carries the hue, not the 23 individual categories. Click a tab — the tiles below recolour.</p>
<div class="groups" id="groups">
<button class="group-tab" data-group="food" aria-selected="true">Food &amp; drink</button>
<button class="group-tab" data-group="night" aria-selected="false">After dark</button>
<button class="group-tab" data-group="water" aria-selected="false">Sun &amp; water</button>
<button class="group-tab" data-group="active" aria-selected="false">Move and play</button>
<button class="group-tab" data-group="leisure" aria-selected="false">Culture &amp; reset</button>
</div>
<div class="tiles" id="tiles" data-group="food">
<button class="tile" aria-pressed="true">Dinner</button><button class="tile">Cafes</button>
<button class="tile">Brunch</button><button class="tile">Dessert</button>
</div>`,
    script: `const SETS={food:["Dinner","Cafes","Brunch","Dessert"],night:["Rooftops & lounges","Nightlife","Live music","Karaoke"],water:["Beach clubs","Water activities","Beaches"],active:["Padel","Adventure","Wellness"],leisure:["Arts & culture","Shopping","City escapes"]};
const g=document.getElementById('groups'),t=document.getElementById('tiles');
g.addEventListener('click',e=>{const b=e.target.closest('.group-tab');if(!b)return;
[...g.children].forEach(x=>x.setAttribute('aria-selected',String(x===b)));
t.dataset.group=b.dataset.group;
t.innerHTML=SETS[b.dataset.group].map((l,i)=>'<button class="tile" aria-pressed="'+(i===0)+'">'+l+'</button>').join('');});`,
  },
  {
    path: "components/vote-option.html", group: "Components", name: "Vote option card",
    subtitle: "Default, selected, winner, dimmed", viewport: { width: 900, height: 460 },
    css: CSS.opt,
    body: `<p class="kicker">Components</p><h2>Vote option</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Selected takes the live accent — "you, and now". The winner takes champagne — "the outcome". They were the same colour until that split was made.</p>
<div class="opts" data-group="food">
<button class="opt"><span class="opt__cat">Dinner</span><span class="opt__name">Ninive</span><span class="opt__meta">Emirates Towers · AED 250</span><span class="opt__votes">1 yes</span></button>
<button class="opt" aria-pressed="true"><span class="opt__cat">Dinner</span><span class="opt__name">The Guild</span><span class="opt__meta">DIFC · AED 220</span><span class="opt__votes">4 yes</span></button>
<button class="opt opt--dim"><span class="opt__cat">Dinner</span><span class="opt__name">Koko Bay</span><span class="opt__meta">Palm Jumeirah · AED 300</span><span class="opt__votes">1 yes</span></button>
</div>
<div class="opts" data-group="food" style="margin-top:.9rem;max-width:300px">
<button class="opt opt--winner"><span class="opt__win">Winner</span><span class="opt__name">The Guild</span><span class="opt__meta">DIFC · Friday 9:30 PM</span><span class="opt__votes">4 yes</span></button>
</div>`,
  },
  {
    path: "components/round-dots.html", group: "Components", name: "Round progress",
    subtitle: "Three rounds: complete, current, upcoming", viewport: { width: 620, height: 260 },
    css: CSS.dots,
    body: `<p class="kicker">Components</p><h2>Round progress</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Nine places narrow to one across three rounds. A finished round takes the live accent.</p>
<div class="dots"><button class="dot" data-complete="true">1</button><button class="dot" aria-current="step">2</button><button class="dot">3</button></div>`,
  },
  {
    path: "components/place-card.html", group: "Components", name: "Discover card",
    subtitle: "Photoless variant, three groups", viewport: { width: 900, height: 420 },
    css: CSS.place,
    body: `<p class="kicker">Components</p><h2>Discover card</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Shown photoless — a 14% wash of the group hue behind the category code. The app has four real venue photos that are barely used today.</p>
<div class="places">
<div class="place" data-group="food"><div class="place__code">DIN</div><div class="place__body"><div class="place__cat">Dinner</div><div class="place__name">Ninive</div><div class="place__meta">Emirates Towers · AED 250</div><div class="place__note">Rana went here in June — rated 5</div></div></div>
<div class="place" data-group="water"><div class="place__code">BCH</div><div class="place__body"><div class="place__cat">Beach club</div><div class="place__name">Koko Bay</div><div class="place__meta">Palm Jumeirah · AED 300</div><div class="place__note">You and 3 friends have been</div></div></div>
<div class="place" data-group="active"><div class="place__code">PAD</div><div class="place__body"><div class="place__cat">Padel</div><div class="place__name">Padel Park</div><div class="place__meta">Al Quoz · AED 90</div><div class="place__note">Booked twice this month</div></div></div>
</div>`,
  },
  {
    path: "screens/plan-composer.html", group: "Screens", name: "Plan composer",
    subtitle: "Category choice through to the deal", viewport: { width: 900, height: 640 },
    css: CSS.groups + CSS.btn + CSS.panel,
    body: `<p class="kicker">Screens</p><h2>Plan composer</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Where a plan starts. Nine places are dealt across three rounds.</p>
<div class="panel" data-group="food">
<div style="font-family:var(--font-display);font-size:1.25rem;font-weight:700;margin-bottom:.75rem">What kind of hangout?</div>
<div class="groups">
<button class="group-tab" data-group="food" aria-selected="true">Food &amp; drink</button>
<button class="group-tab" data-group="night" aria-selected="false">After dark</button>
<button class="group-tab" data-group="water" aria-selected="false">Sun &amp; water</button>
</div>
<div class="tiles"><button class="tile" aria-pressed="true">Dinner</button><button class="tile">Cafes</button><button class="tile">Brunch</button></div>
<div class="stats"><div class="stat"><b>9</b><span>Places</span></div><div class="stat"><b>3</b><span>Pools</span></div><div class="stat"><b>3</b><span>Finalists</span></div><div class="stat"><b>1</b><span>Plan</span></div></div>
<div class="row" style="margin-top:1.25rem"><button class="btn">Deal 9 places in 3 rounds</button></div>
</div>`,
  },
  {
    path: "screens/voting-round.html", group: "Screens", name: "Voting round",
    subtitle: "What a friend sees on the share link", viewport: { width: 900, height: 560 },
    css: CSS.opt + CSS.dots + CSS.btn,
    body: `<p class="kicker">Screens</p><h2>Voting round</h2>
<p class="label" style="margin:.5rem 0 1.25rem">What someone opening the share link sees. No signup — they type a name and pick one per round.</p>
<div style="border:1px solid var(--color-line);background:var(--color-card);padding:1.5rem" data-group="food">
<div style="border-top:4px solid var(--group);margin:-1.5rem -1.5rem 1.25rem"></div>
<div style="font-family:var(--font-display);font-size:1.5rem;font-weight:800">Friday dinner</div>
<div class="label" style="margin:.25rem 0 1.25rem">Round 2 of 3 · Hey Rana · 4 people voting · closes 8:00 PM</div>
<div class="dots" style="margin-bottom:1.25rem"><button class="dot" data-complete="true">1</button><button class="dot" aria-current="step">2</button><button class="dot">3</button></div>
<div class="opts">
<button class="opt"><span class="opt__cat">Dinner</span><span class="opt__name">Ninive</span><span class="opt__meta">Emirates Towers · AED 250</span><span class="opt__votes">1 yes</span></button>
<button class="opt" aria-pressed="true"><span class="opt__cat">Dinner</span><span class="opt__name">The Guild</span><span class="opt__meta">DIFC · AED 220</span><span class="opt__votes">4 yes</span></button>
<button class="opt"><span class="opt__cat">Dinner</span><span class="opt__name">Koko Bay</span><span class="opt__meta">Palm Jumeirah · AED 300</span><span class="opt__votes">1 yes</span></button>
</div>
<div class="row" style="margin-top:1.25rem"><button class="btn">Continue to round 3</button><button class="btn btn--ghost btn--small">Copy link</button></div>
</div>`,
  },
  {
    path: "screens/voting-round-after-dark.html", group: "Screens", name: "Voting round — After Dark",
    subtitle: "The night direction: lattice, brass rules, leader sheen",
    viewport: { width: 900, height: 620 }, theme: "night",
    css: CSS.opt + CSS.dots + CSS.btn + `
body { position:relative; }
body::before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none;
  background:
    repeating-linear-gradient(45deg, rgba(195,165,115,.07) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(-45deg, rgba(195,165,115,.07) 0 1px, transparent 1px 22px),
    var(--color-paper); }
body::after { content:""; position:fixed; z-index:-1; top:-14rem; left:50%; width:26rem; height:26rem;
  margin-left:-13rem; pointer-events:none; filter:blur(28px); animation:ad-halo 32s linear infinite;
  background:conic-gradient(from 0deg, rgba(195,165,115,.18), transparent 40%, rgba(195,165,115,.12) 70%, transparent); }
@keyframes ad-halo { to { transform:rotate(360deg); } }
.ad-rule { display:flex; align-items:center; gap:.625rem; color:var(--color-punch);
  font-size:.6rem; font-weight:700; letter-spacing:.24em; text-transform:uppercase; }
.ad-rule::before, .ad-rule::after { content:""; flex:1; height:1px;
  background:linear-gradient(to right, transparent, rgba(195,165,115,.7)); }
.ad-rule::after { background:linear-gradient(to left, transparent, rgba(195,165,115,.7)); }
.ad-nums { display:flex; justify-content:center; align-items:center; gap:.6rem;
  color:var(--color-punch); font-size:.66rem; letter-spacing:.2em; margin-top:.9rem; }
.ad-nums span[data-on] { font-weight:700; border-bottom:1px solid var(--color-punch); padding-bottom:2px; }
.ad-nums span[data-done] { color:var(--color-live); }
.ad-nums .d { font-size:.45rem; opacity:.5; }
.ad-opt { position:relative; overflow:hidden; display:grid; grid-template-columns:1fr auto; gap:12px;
  align-items:center; text-align:left; width:100%; padding:18px 16px; cursor:pointer;
  border:1px solid rgba(195,165,115,.28); background:var(--color-card); font-family:inherit; }
.ad-opt__cat { font-size:.58rem; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--color-group-food); }
.ad-opt__name { font-family:var(--font-display); font-size:1.25rem; font-weight:700; color:var(--color-ink); letter-spacing:-.01em; }
.ad-opt__meta { font-size:.78rem; color:var(--color-muted); }
.ad-opt__votes { display:grid; place-items:center; width:2.75rem; height:2.75rem;
  border:1px solid rgba(195,165,115,.35); color:var(--color-punch);
  font-family:var(--font-display); font-size:1.15rem; font-weight:700; font-variant-numeric:tabular-nums; }
.ad-opt[aria-pressed="true"]::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--color-live); }
.ad-opt--leader { border-color:rgba(195,165,115,.6); }
.ad-opt--leader .ad-opt__cat { color:var(--color-punch); }
.ad-opt--leader .ad-opt__votes { border-color:var(--color-punch); background:rgba(195,165,115,.12); }
.ad-opt--leader::after { content:""; position:absolute; inset:0; pointer-events:none; background-size:250% 100%;
  background:linear-gradient(105deg, transparent 30%, rgba(195,165,115,.22) 48%, transparent 62%);
  animation:ad-sheen 6s ease-in-out infinite; }
@keyframes ad-sheen { 0%{ background-position:-160% 0; } 55%,100%{ background-position:260% 0; } }
.ad-cta { flex:1; padding:14px 18px; border:1px solid var(--color-punch); cursor:pointer;
  background:linear-gradient(180deg, #d8bd8c, #b8975f); color:#17181b;
  font-family:var(--font-display); font-weight:800; font-size:.9rem; letter-spacing:.04em; }
.ad-ghost { padding:14px 18px; border:1px solid rgba(195,165,115,.5); background:transparent;
  color:var(--color-punch); font-family:var(--font-display); font-weight:700; font-size:.8rem;
  letter-spacing:.1em; text-transform:uppercase; cursor:pointer; }`,
    body: `<p class="kicker">Screens</p><h2>Voting round — After Dark</h2>
<p class="label" style="margin:.5rem 0 1.25rem">Turn 1 of the Claude Design canvas, and the direction turns 3–7 all build on. Night only — brass is 3.37:1 on ivory. Ships as <code>.vote-experience--night</code>.</p>
<div style="max-width:420px;margin:0 auto;border:1px solid rgba(195,165,115,.35);padding:1.75rem 1.5rem 1.5rem;background:rgba(18,20,24,.6)">
<div class="ad-rule">Round II of III</div>
<div style="text-align:center;margin-top:.9rem;font-family:var(--font-display);font-size:2rem;font-weight:800;letter-spacing:-.02em">Friday dinner</div>
<div style="text-align:center;margin-top:.35rem;font-size:.78rem;letter-spacing:.06em;color:var(--color-muted)">4 of 6 voted · table holds until 8:00 PM</div>
<div class="ad-nums"><span data-done>I</span><span class="d">◆</span><span data-on>II</span><span class="d">◆</span><span style="opacity:.35">III</span></div>
<div style="display:flex;flex-direction:column;gap:12px;margin-top:1.6rem">
<button class="ad-opt"><span style="display:flex;flex-direction:column;gap:4px"><span class="ad-opt__cat">Dinner</span><span class="ad-opt__name">Ninive</span><span class="ad-opt__meta">Emirates Towers · AED 250</span></span><span class="ad-opt__votes">1</span></button>
<button class="ad-opt ad-opt--leader" aria-pressed="true"><span style="display:flex;flex-direction:column;gap:4px"><span class="ad-opt__cat">Dinner · leading</span><span class="ad-opt__name">The Guild</span><span class="ad-opt__meta">DIFC · AED 220</span></span><span class="ad-opt__votes">4</span></button>
<button class="ad-opt"><span style="display:flex;flex-direction:column;gap:4px"><span class="ad-opt__cat">Dinner</span><span class="ad-opt__name">Koko Bay</span><span class="ad-opt__meta">Palm Jumeirah · AED 300</span></span><span class="ad-opt__votes">1</span></button>
</div>
<div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(195,165,115,.2);display:flex;align-items:center;gap:10px">
<span style="width:8px;height:8px;border-radius:50%;background:var(--color-live)"></span>
<span style="font-size:.76rem;color:var(--color-muted)">Rana voted 2 minutes ago · Mo is looking now</span></div>
<div style="display:flex;gap:10px;margin-top:1.5rem"><button class="ad-ghost">Re-deal</button><button class="ad-cta">Lock in · round III</button></div>
</div>`,
  },
];

const page = (c) => `<!-- @dsCard group="${c.group}" -->
<!doctype html>
<html lang="en" data-theme="${c.theme || "day"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>plan-ind — ${c.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;700&display=swap">
<style>${TOKENS}${BASE}${c.css || ""}</style>
</head>
<body>
${c.body}
${c.script ? `<script>${c.script}</script>` : ""}
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
