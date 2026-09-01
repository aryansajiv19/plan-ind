# Wave-1 design specs — T3 → T2

Authoritative handoff for the Frontend lane. Owner-approved 2026-09-01. Covers
FE.1 (front door), FE.2 (signature `.token`), FE.5 (After Dark on the payoff),
FE.6 (dead CSS verdict).

Binding rules live in `FRONTEND_DESIGN_STANDARDS.md` and the `design-standards`
skill. This file is the concrete build sheet; where they disagree, the standards
win and this file gets fixed.

Token names as they exist in `app/globals.css`: day `@theme` + `--night` scopes
(`.home-experience--night` ~`:2063`, `.vote-experience--night` ~`:2130`).
`--vote-metal` / `--home-metal` / `--color-punch` are all the same champagne
(`#9b7d4e` day, `#c3a573` night). `--color-punch-text` is the small-text cut
(`#7a6038` day, `#c3a573` night).

---

## FE.2 — signature `.token` (ratified; do not rework)

T2's in-flight implementation matches the standards:
- `--token-shadow` is a token, not a literal: `#17181b` in `@theme`,
  `rgba(195,165,115,0.35)` in both `--night` scopes, measured ratios in comments.
- offsets: `5px 6px 0` rest → `7px 8px 0` hover → `1px 1px 0` active, `0.12s ease`.
- restraint block deleted, replaced by the note explaining why.
- unlayered `.vote-option` variant rules restate the shadow so `aria-pressed` /
  `--winner` / `:active` don't drop it.

### Reach — final

The signature marks **surfaces that commit a decision**, nothing else:

| Surface | Shadow | Notes |
|---|---|---|
| `.vote-option` (vote card) | graphite/brass via `token` class in markup | already done |
| `.vote-primary-action`, `.vote-result__primary`, `.plan-submit`, `.home-primary-cta` | `5px 6px 0 var(--token-shadow)`; hover-lift only under `@media (hover:hover)` | already done |
| `.vote-result` (decided-plan panel) | **champagne cut** — `5px 6px 0 var(--vote-metal)`, matching `.vote-option--winner` | **add** (see FE.5) |

**Do not** put the token on Discover place cards (they already carry a group-hue
top border as identity — an offset shadow on a 9-up grid is clutter and dilutes
the vote card as *the* object you tap) or on category tiles (already a scale +
inset-bar press). If a future surface wants it, it has to be something the user
*decides* with.

### Cleanup for T2

1. `app/globals.css` ~`:862` — `.home-primary-cta:hover` still sets the old soft
   drop `box-shadow: 0 0.8rem 2rem rgba(23,24,27,0.12)`. The new primary-actions
   block (~`:2433`) adds the token shadow but this rule still fires and fights it.
   Delete the `box-shadow` from the `:862` rule (keep the `transform`), or fold it
   into the new block.
2. Confirm `.home-experience--night .home-primary-cta` (~`:2113`) does not reset
   `box-shadow`.
3. `prefers-reduced-motion`: no action — the global `transition-duration` override
   covers the token transition; the `:active` translate is a press response, not
   ambient motion; there is no `requestAnimationFrame` loop here.

---

## FE.1 — front-door hero upgrade

**Ratified as-is:** signed-out `HomeExperience` (`demoMode` without `fixtures`),
`.home-nav__signin` ink-fill button, sign-in-first CTAs, `accountTabs` gating.

**Upgrade:** the hero was built before After Dark and `.home-experience--night`
only flips colours. Give the front door the product's actual night atmosphere so
an after-sunset prospect meets After Dark, not a recoloured white page. All new
rules scoped to `.home-experience--night` and, where noted, `.home-hero`.

### N1 — masthead halo

Brass conic halo behind `.home-logo`, identical mechanism to
`.vote-experience--night::after`:

```css
.home-experience--night .home-nav { position: relative; isolation: isolate; }
.home-experience--night .home-nav::after {
  content: "";
  position: absolute;
  z-index: -1;
  top: -11rem;
  left: 1.5rem;            /* over the logo, not centred */
  width: 22rem;
  height: 22rem;
  pointer-events: none;
  filter: blur(28px);
  background: conic-gradient(
    from 0deg,
    rgba(195, 165, 115, 0.16),
    transparent 40%,
    rgba(195, 165, 115, 0.10) 70%,
    transparent
  );
  animation: ad-halo 32s linear infinite;   /* reuse the existing keyframe */
}
```

This is the front door's **one** ambient loop (see motion budget below).

### N2 — hero lattice ground

Static brass lattice on the hero section only, same values as
`.vote-experience--night::before`:

```css
.home-experience--night .home-hero {
  background:
    repeating-linear-gradient(45deg,  rgba(195,165,115,0.06) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(-45deg, rgba(195,165,115,0.06) 0 1px, transparent 1px 22px);
}
```

`0.06` not `0.07` — the hero ground sits a touch lighter than the vote shell and
the vote value reads slightly heavy behind large display type. Confirm by eye.

### N3 — "Tonight in Dubai" panel → previews the real vote screen

`.home-system` is `aria-hidden` product illustration. At night it should look
like the After Dark vote round it is illustrating.

- **Header rules.** Flank the `.home-system__header` label with brass hairline
  rules, reusing the `.vote-round-label::before/::after` gradient pattern
  (`linear-gradient(to right/left, transparent, color-mix(in srgb, var(--vote-metal) 70%, transparent))`).
  Needs the header text wrapped in a `<span>` so the rules have something to sit
  beside — **T2 markup change** in `HomeExperience.tsx` (~`:280`).
- **Vote counts → struck brass plates.** `.home-system-row__votes` at night:
  match `.vote-experience--night .vote-option__votes` exactly — `display: grid;
  place-items: center; width: 2.75rem; height: 2.75rem; border: 1px solid
  color-mix(in srgb, var(--vote-metal) 35%, transparent); color: var(--vote-metal);
  font-family: var(--font-display); font-size: 1.15rem; font-weight: 700`.
  Note: this panel uses `--home-metal`, which equals `--vote-metal` at night, so
  either token is fine — use `--home-metal` for consistency with the surrounding
  block.
- The active row (`.home-system-row--active`) keeps its existing treatment;
  don't add the leader sheen here (that's a second ambient loop — over budget).

### N4 — day hero

No structural change. It only picks up the FE.2 token shadow on
`.home-primary-cta`, already covered above.

### N5 — real Dubai photography: DEFERRED

Do not add an image this wave. Auto-memory `skyline-backdrop` records the real
photo as deferred mid-build; FE.3 owns the `[data-phase]` skyline engine. N1+N2
are the atmosphere for now and are deliberately built to **compose over** a
skyline layer added behind `.home-hero` later — FE.3 slots it in without
reworking this.

### Motion budget

`FRONTEND_DESIGN_STANDARDS.md` Motion §: max two ambient loops per screen.
Front-door night after this change = **1** (the halo). The lattice is static; the
`.home-title strong::after` underline and `.home-title__line` slides are one-shot
entrances. FE.3's skyline drift is the second loop — leave room for it.

`ad-halo` is a CSS `animation`, so the global reduced-motion `animation-duration`
override reaches it. Verify in the browser with `prefers-reduced-motion: reduce`
that the halo freezes.

---

## FE.5 — After Dark on the payoff (`DecidedPlan` / `.vote-result`)

Two parts. `components/DecidedPlan.tsx` markup + the existing `.vote-result`
block in `app/globals.css` (~`:2451`), which is already partly on-system.

### Part A — day cleanup

`DecidedPlan.tsx` is styled with inline Tailwind that fights the `.vote-result`
block. Strip the utilities, move everything into `globals.css`, align to
`.vote-option`.

| In markup now | Replace with |
|---|---|
| `rounded-2xl` (container, primary, fields) | nothing — `.vote-result` already sets `border-radius: 0.12rem`; delete the utility |
| `border-2 border-punch` | nothing — `.vote-result` sets `border-width: 1px; border-color: var(--vote-metal)` |
| `bg-punch/5` | nothing — `.vote-result` sets `color-mix(in srgb, var(--vote-metal) 5%, var(--color-card))`; bump to **8%** to match `.vote-option--winner[aria-pressed]` |
| primary button `bg-zest ... text-ink` | `.vote-result__primary` → champagne, ink-on-metal like `.vote-primary-action` (`background: linear-gradient(180deg,#d8bd8c,#b8975f)` is the night cut; day is flat `var(--vote-metal)` fill, `color: #17181b`) |
| booked span `bg-mint/15 text-mint rounded-full` | `.vote-result__booked` already exists (`1px var(--vote-metal)` border, `--color-punch-text` text) — just use it; drop the utilities. (`mint` === `#9b7d4e`, a champagne alias — stop referencing it.) |
| category chip `grid h-12 w-12 rounded-xl text-2xl` | `.vote-result__category` → match `.vote-option__category`: rectangular, `padding: 0.25rem 0.625rem`, `font-size: 0.75rem`, `font-weight: 700`, `color: var(--color-punch-text)`, `border: 1px solid var(--vote-metal)`, **`border-radius: 0.12rem`** (it is a circle today — `border-radius: 50%` at `:2460`). `text-2xl` reads as an emoji; the code is 3 letters, size it like the vote card's. |
| RSVP buttons `rounded-xl border-2` | `.vote-result__button` styling from the block; `1px` border |

Container also takes the **champagne token shadow**:

```css
.vote-result { box-shadow: 5px 6px 0 var(--vote-metal); }
```

Matches `.vote-option--winner`. This is the payoff's place in the FE.2 reach —
the decided plan *is* the outcome. `.vote-result__primary` already gets the
graphite/brass token shadow from the primary-actions block; keep it.

### Part B — After Dark night layer

Scoped to `.vote-experience--night .vote-result`. `DecidedPlan` already renders
inside `.vote-experience--night` and inherits the flipped vars and the app-wide
`.vote-experience--night::after` halo — **do not add a second halo**.

- **Section dividers.** The `border-t border-line` rules between When / Who's in /
  Booking / Calendar / Rate become brass hairlines:
  `border-top-color: color-mix(in srgb, var(--vote-metal) 30%, transparent)`.
- **The kicker becomes the payoff's round-plate.** "Decided · you're going"
  (`.vote-kicker`) at night: `color: var(--vote-metal); letter-spacing: 0.24em;
  font-size: 0.6rem`, flanked by the `.vote-round-label::before/::after` gradient
  rules. This is the payoff's structural echo of the round label. May need the
  kicker wrapped so the rules have a flex container — **T2 markup**, small.
- **`It's {winner.name}.` stays ink.** Brass = "where you are"; the name is the
  subject, not a location. The champagne frame (border + token shadow) carries
  "the outcome", exactly as in day. Do not tint the name.
- **Category chip → struck brass plate.** `.vote-experience--night
  .vote-result__category`: match `.vote-experience--night .vote-option__votes`
  (2.75rem square, `1px color-mix(in srgb, var(--vote-metal) 35%, transparent)`,
  display font, `1.15rem/700`, `color: var(--vote-metal)`).
- **Controls → brass ghost.** `.vote-experience--night .vote-result__button`
  (RSVP, "I'll book it", "Mark as booked"): mirror `.ad-ghost` from
  `voting-round-after-dark.html` — `border: 1px solid color-mix(in srgb,
  var(--vote-metal) 50%, transparent); background: transparent; color:
  var(--vote-metal); letter-spacing: 0.1em`. The `aria-pressed="true"` state
  (already `background: var(--vote-metal); color: #111218` at `:2469`) stays.

### Part C — the reveal moment (restrained)

Owner chose "night layer", **not** "full moment" — so **no** `.rosette` /
`.rosette-show` revival. Just: when the plan resolves, `.vote-result` enters once
with the gold sweep.

```css
.vote-experience--night .vote-result { position: relative; overflow: hidden; }
.vote-experience--night .vote-result::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 30%, rgba(195,165,115,0.22) 48%, transparent 62%);
  background-size: 250% 100%;
  animation: ad-sheen 1.2s ease-out 1;   /* ONCE — reuse the keyframe, not the infinite timing */
}
@media (prefers-reduced-motion: reduce) {
  .vote-experience--night .vote-result::after { animation: none; }
}
```

`ad-sheen` is defined as an infinite loop on `.vote-option--leader`; here it runs
a single 1.2s pass on mount. A one-shot is not ambient motion and does not count
against the 2-loop budget (Motion § updated to say so). Day gets no sweep —
"fun comes from light and reveal" and brass on ivory is invisible.

---

## FE.6 — dead CSS verdict

### Delete now — `app/globals.css`

The decision-orbit / ticker / scribble block. **Zero** `.tsx` references
(confirmed 2026-09-01: `grep -rn "decision-orbit\|home-orbit\|home-ticker\|home-scribble" --include='*.tsx'` → empty). Remove:

- `.home-decision-orbit`, `.home-orbit-copy`, `.home-orbit-core`,
  `.home-orbit-core__number`, `.home-orbit-core__label` (~`:1083–1150`)
- `.home-scribble`, `.home-scribble--one`, `.home-scribble--two` (~`:1176–1190`)
- `.home-ticker`, `.home-ticker__track`, `.home-ticker__track span` (+ its
  `:last-child` / `:nth-child` rules) (~`:1192–1220`)
- `@keyframes home-spin`, `home-orb-breathe`, `home-card-float` (~`:2602–2604`)
- the responsive overrides for all of the above: `.home-decision-orbit` /
  `.home-orbit-core__number` / `.home-scribble` / `.home-ticker__track` blocks in
  the `@media` sections (~`:2620–2633`, `:2689–2691`, `:2699`, `:2704` if
  orbit-only)
- the `.home-orbit-copy` and `.home-ticker__track` entries in the
  reduced-motion block (~`:2834`)

~200–250 lines. Do a full-file grep for each class after deleting to confirm no
dangling selector-list references.

### Keep, dormant, dated — the skyline

`@property --sky-1/2/3`, `.sky-root`, `.sky-wash`, `.sky-glow`, `.sky-svg`,
`.sky-far`, `.sky-near`, `.sky-win`, `.sky-haze`, `@keyframes sky-drift-far /
sky-drift-near / sky-haze-drift`, the seven `[data-phase="…"]` palette blocks
(~`:379–453`), and the reduced-motion `.sky-far, .sky-near, .sky-haze` freeze
(~`:2825`). Add one comment at the block head (~`:205`):

```css
/* DORMANT — the markup that renders this (<div class="sky-root">…) was dropped
   in the walk-back and returns with FE.3 (theme follows the Dubai clock); the
   phase engine comes back from commit 3dd972b. Re-verified dead in markup
   2026-09-01. Do not delete without closing FE.3 — the seven [data-phase]
   palettes are the expensive part to rebuild. */
```

### Flag — not T3's call

`HomeExperience.tsx:176` renders `<div className="home-grid-field" aria-hidden />`.
`.home-grid-field` — check whether it has a rule and does anything visible. If
it's a dead no-op, drop the div; if it's meant to be the old backdrop grid, it
needs a rule or it goes. T2 decides; note the outcome in the coordination board.

---

## Verification (T2 runs, T3 reviews before "done")

- `npm run lint`, `npx tsc --noEmit --pretty false`, `npm run build`, `npm run test`.
- Browser at 375 / 768 / 1280 / 1440, **day and night**:
  - `/` signed out — halo freezes under reduced-motion, lattice not too heavy
    behind the title, "Tonight in Dubai" plate reads like the vote screen.
  - a decided plan — seeded `/plan/22222222-2222-2222-2222-222222222222` — day
    cleanup landed (no `rounded-2xl`, no circular chip, champagne frame + shadow),
    night After Dark layer, the one-shot sweep fires once on load and not again.
- Keyboard nav + graphite **inset** focus rings on every payoff control.
- `prefers-reduced-motion: reduce` kills the halo, the lattice is static anyway,
  the reveal sweep does not run; no layout shift.
- `a11y-responsive` skill pass.
