# Production push spec — 2026-09-04

Authoritative. Supersedes every colour/token value below this section (the
"Wave-1" specs are archived at the foot of this file — read them for the
component API details that still hold, e.g. `<VoteState>`'s shape; do not
read them for colour). Written for Frontend to implement without a
follow-up question: every item below has an exact selector, exact current
value, exact replacement value, and a file:line anchor.

Owner's own words on why this exists (`AGENT_COORDINATION.md`): *"i dont
like the navy blue gold theme if we switch to more fun colors but the goal
is to keep the app looking modern sleek luxurious as well."* Root-caused
(not guessed) via a full read-only audit — one Explore agent, 109K tokens,
51 tool calls — before writing anything below. Rendered against real UI
before presenting; see `design-system/dist/foundations/colour-next.html`.

---

## 1 — Colour: the full respec (palette v3 — supersedes v2 below)

**Day/night stays.** Reversed same-day: the "one dark identity" call (v2,
coral/gold/teal on `#121212`) was itself reversed by the owner —
*"i like white and navy blue together maybe that for the day mode i
guess."* Two separately authored palettes again, selected by the Dubai
clock, matching how this app's colour system has always worked before the
brief-lived v2 detour. v2's exact values are kept in this document,
struck through in spirit, because the fill-contrast rule and the four-job
structure it established both carry forward unchanged — only the hexes
move.

### Night — palette v3

| Role | Token | Value | Measured |
|---|---|---|---|
| Ground | `--color-paper` | `#0D1117` | — deep charcoal-navy, cooler than pure black |
| Surface | `--color-card` | `#161B22` | — |
| Text primary | `--color-ink` | `#F2EFE9` | 16.49:1 on ground, 15.07:1 on surface |
| Text secondary | `--color-muted` | `#8A8F98` | 5.82:1 on ground, 5.32:1 on surface |
| Error/urgent | `--color-error` | `#FF5C5C` | 6.25:1 on ground |

**Primary/wordmark job — settled.** `#C9A876` champagne gold (8.42:1 on
ground, 7.7:1 on surface), `#5CC8D7` glass-blue as the premium/badge
(sparing) job (9.64:1). This is a deliberate confirmation, not an
unexamined default: I flagged that gold-on-navy is structurally close to
the "navy and gold" combination this colour pass opened by rejecting,
built and rendered the alternative (glass-blue primary, gold sparing) side
by side with it, and the owner picked gold-primary anyway, explicitly —
the resemblance is a deliberate direction on their end, not a drift they
missed. **Build with confidence; this is final.** The alternative render
stays in `design-system/dist/foundations/colour-next.html` for the
record, not as a live option.

**Confirm/active** — `--color-live` `#00E0C7` teal, 11.25:1 on ground /
10.29:1 on surface. Unchanged from v2. **Small components only — badges,
pills, status text, never a large surface or a fill.** This constraint
survived a full churn (teal → violet, rendered and checked against the
"purple and black" warning, reverted anyway) and is binding.

### Day — proposed white/navy, not yet confirmed

The owner's own wording was tentative — *"maybe that for the day mode i
guess"* — so this is a concrete, contrast-checked starting point built to
react to, not a locked answer. If white-and-navy meant something more
specific, correct these values rather than treating them as final.

| Role | Token | Value | Measured |
|---|---|---|---|
| Ground | `--color-paper` | `#F7F7F5` | — off-white, not stark white |
| Surface | `--color-card` | `#FFFFFF` | — pure white, so cards lift off the ground |
| Text primary | `--color-ink` | `#141414` | 17.17:1 on ground, 18.42:1 on surface |
| Text secondary | `--color-muted` | `#5B5F66` | 5.98:1 on ground, 6.42:1 on surface |
| Primary/wordmark | `--color-punch` | `#1B2A4A` navy | 13.26:1 on ground as text; 14.22:1 as a white-ink fill |
| Premium/badge (sparing) | `--color-accent-premium` | `#8A6D2F` deep gold | 4.54:1 on ground — the day cut has to be darker than night's `#C9A876` to clear AA on a light ground, same asymmetry the very first day/night system in this app used |
| Confirm/active | `--color-live` | `#0E7C74` deep teal | 4.71:1 on ground — same small-components-only constraint as night |
| Error/urgent | `--color-error` | `#B3261E` | 6.09:1 on ground |

### Fill contrast — unchanged rule, re-verify on the new hexes

Every accent above is light-to-mid tone at night, mid-to-dark by day. As a
**fill** (a button background, a filled badge), the text on it is the
*other* end of the scale — dark ink (`#0D1117`/`#141414`-family) on a
night fill, white/light ink on a day fill (day's navy primary is dark
enough that it takes light ink, the one place day's rule differs from
night's — check per-value, don't assume the pattern from night carries
over unchanged). This is the exact shape of the bug at §3 below — don't
reintroduce it with the new palette either.

### The colour system still has four jobs

| Job | Where |
|---|---|
| The outcome / primary action | primary CTAs, the winner treatment, the wordmark |
| You, and now / confirm / active | RSVP confirmed, live/active states, round dots — small components only |
| Premium marker, used sparingly | badges, streaks — never a button, never body text, never more than one or two instances per screen |
| Error / urgent | validation errors, closing-soon warnings |

Category/group colour stays retired — nothing above reopens it. Neither
does the rejected v1 teal identity (`#12666e`/`#68b8c0`) or brass/champagne
from before that.

### Legacy alias tokens

`--color-grape`, `--color-zest`, `--color-mint` should alias to
`--color-punch` in both grounds, so the ~19 `text-grape`/`bg-punch`/
`bg-zest`/`text-mint` utility-class usages already in components inherit
correctly with zero component edits.

---

## 2 — Day/night mechanism: keep it, add a real day branch

**Reversed from this document's own first pass**, which called for
deleting `lib/dubai-phase.ts` and `components/ThemeSync.tsx` outright.
Two signals needed reconciling, and this time the reconciliation is
simpler than the first round: the owner's checklist warned against
stripping the mechanism as a reflexive "kill dark mode" move because it's
real product logic; then, separately and explicitly, the owner asked for
day mode back. Nothing to interpret here — build the day branch, don't
remove the mechanism.

- **Keep** `lib/dubai-phase.ts`, `components/ThemeSync.tsx`, the
  `nightMode` state and toggle in `components/HomeExperience.tsx`, and
  every `[data-theme="night"]` block in `app/globals.css` — **all of it
  stays live**, exactly as it was before v2's colour-only detour.
- **Add**: the day values from §1 become the unconditional `@theme` block
  (the default, no `[data-theme]` needed); the night values from §1
  replace the current teal-era `[data-theme="night"]` overrides. This is
  additive/repointing work, not deletion.
- **`app/manifest.ts:17-18`**: `theme_color` tracks the *default* (day)
  ground, `#F7F7F5`, replacing the current stale `#f3f1ec`. `background_color`
  can stay day as well, or the app can register both via
  `prefers-color-scheme` media queries in the manifest if that level of
  polish is wanted — not required for this pass.
- `dubaiHour()` remains available for any future non-colour "tonight"
  framing, unchanged from the first draft of this section.

---


## 3 — Structural bug-fix spec

Each item: selector, current value, replacement, file:line. All in
`app/globals.css` unless noted. Fixes the owner's literal words —
"components misaligned", "elements at the edge of the screen" — with
evidence, not a guess.

### 3.1 — Six container widths → one rail system

Current: `.home-nav` (`100vw` calc, `:673`), `.home-hero`/`.demo-view`/
`.home-wall-section`/`.home-footer` (`min(100% - 2rem, 76rem)`),
`.home-appbar` (`100% - 3rem`, `:2990`), `.home-plan-section`/`.home-library`
(`68rem`, not `76rem`, `:1377`/`:2086`).

**Fix**: standardise every one of these on `min(100% - 2rem, 76rem)`. Change
`.home-appbar` from `3rem` to `2rem`; change `.home-plan-section` and
`.home-library` from `68rem` to `76rem`. One rail, one number, everywhere.

### 3.2 — `100vw` vs `100%` in the nav

`app/globals.css:673` — `.home-nav` centres with
`padding-inline: max(1rem, calc((100vw - 76rem) / 2))`. Every sibling uses
`min(100% - 2rem, 76rem)` (`%`, not `vw`) — `100vw` includes the scrollbar,
`100%` doesn't, so the nav sits ~7–8px off from everything below it on any
desktop with a classic scrollbar.

**Fix**: replace the padding-inline calc with the same `min(100% - 2rem, 76rem)`
pattern as every sibling, applied as `margin-inline: auto` on a fixed-width
inner element rather than asymmetric padding on the full-width nav — matches
how `.home-hero` etc. already centre themselves.

### 3.3 — `overflow: hidden` breaks sticky and hides overflow silently

`app/globals.css:615` — `.home-experience { overflow: hidden }`. This makes
`.home-experience` the scroll container for its sticky descendants, so
neither `.home-nav` (`position: sticky; top: 0`, `:678-679`) nor
`.home-plan-section__intro` (`position: sticky; top: 3rem`, `:1386`) ever
actually sticks. It also means any element that overflows its box (§3.4,
§3.5) is silently clipped instead of visibly scrolling or wrapping — the
reason those bugs read as "elements vanish at the edge" rather than an
obvious layout break.

**Fix**: remove `overflow: hidden` from `.home-experience`. If it was there
to clip the dead decorative artwork (§4 — `.home-orb`, `.home-decision-orbit`,
etc.), that artwork is being deleted anyway, so the clip has no remaining
job. Re-test after removal that nothing else relied on it (there is no other
known reason for it, but confirm before deleting — see Verification).

### 3.4 — `.home-system` panel bleeds off the right edge

Root cause, confirmed by direct measurement: `components/HomeExperience.tsx:310`
wraps the "Tonight in Dubai" panel in `<TiltCard className="home-system">`.
`TiltCard` (`components/TiltCard.tsx`) sets a Motion-driven inline
`style={{ rotateX, rotateY, transformStyle }}` on the same element that
carries the CSS class rule `transform: translate(-50%, -50%)`
(`app/globals.css:1053`), which centres the panel inside `.home-stage`. An
inline `style` attribute wins over a class rule for the same CSS property —
the centring translate is never applied. Measured: the panel's left edge
lands exactly on `.home-stage`'s centre point (where un-translated
`left: 50%` alone puts it), and its right edge sits ~110px past a 1440px
viewport.

**Fix**: per Frontend's own proposed patch (in their `AGENT_COORDINATION.md`
block) — `TiltCard` gains an opt-in `centered` prop that folds the
`translate(-50%, -50%)` into Motion's `transformTemplate` so it composes
with the rotation instead of being overwritten. Since §5/§6 rebuild this
region of the home page anyway, whoever writes the new markup should either
wire `<TiltCard centered>` at whatever replaces this call site, or — if the
rebuilt panel no longer needs absolute-centre positioning (a normal
in-flow panel doesn't) — drop the `transform: translate(-50%,-50%)` CSS
rule entirely rather than reach for the prop. Prefer the second: simpler,
one less thing to get wrong later.

### 3.5 — Nav overflows between ~521px and ~701px

Five tabs at `min-width: 4.8rem` (`:735`) + gaps (384px + 4×0.35rem) + logo
(44px) + right-side cluster (~219px) + 2rem padding ≈ 701px minimum, in a
`display: flex` row with no wrap. The `≤520px` breakpoint (`:2796-2805`)
moves tabs to a bottom bar too late to cover this range; combined with §3.3,
the avatar/sign-in control is silently clipped off the right edge at common
tablet/small-laptop widths.

**Fix**: raise the bottom-bar breakpoint from `≤520px` to `≤700px` — cheapest
correct fix given the numbers above, one value changed in one place. (Removing
the day/night toggle per §2 also frees ~50px in `.home-nav__right`, which
narrows the affected range but does not close it — do both.)

### 3.6 — Two duplicate `@media (max-width: 520px)` blocks

`app/globals.css:2789` and `:3029` both target `520px`; the later one wins,
so `.home-plan-section` (`:2856`) and `.demo-view` (`:2868`) declarations in
the **earlier** block are dead — anyone editing the first block sees no
effect. **Fix**: merge into one block (keep the later one's values, since
those are the ones actually rendering); delete the earlier block's now-empty
selectors.

### 3.7 — `.home-system` never themes, fails contrast by design

`app/globals.css:1042-1182` — hardcoded `background: #111318`, `color: white`,
a *night*-teal-hardcoded border regardless of ground, ~15 more
`rgba(255,255,255,…)` literals, and two measured AA failures inside it:
`.home-system-row--active` text `#15161a` on the (formerly theme-reactive)
accent = 2.71:1; `.home-system-row__number` accent-on-panel = 2.79:1.

**Fix**: this entire panel is being rebuilt in §5/§6 anyway (the deck panel
reuses `components/kokonutui/card-stack.tsx` instead). If any part of its
current markup survives the rebuild, re-theme it onto the §1 tokens — no
hardcoded hex anywhere in it — rather than porting the literals forward.

### 3.8 — The white 0.55-alpha chip

`app/globals.css:1547` — `.plan-category-option, .plan-deadline { background:
rgba(255, 255, 255, 0.55) }`. A semi-opaque white card reads as a stark
white slab on the night ground (§1) specifically — on the new day ground
it's closer to correct by accident, which is exactly why this kind of bug
survives: it looks fine in whichever theme someone happens to check.

**Fix**: `background: var(--color-card)`, matching every other card
surface — resolves to `#161B22` at night, `#FFFFFF` by day, themed
correctly either way instead of a fixed literal. Selected/active state (if
this rule also serves that) should use `color-mix(in srgb, var(--color-punch)
12%, var(--color-card))` or similar, not opacity-over-white.

### 3.9 — Four hardcoded `text-white` on accent fills

`app/plan/[id]/page.tsx:768,781`, `components/NameGate.tsx:47`,
`components/DecidedPlan.tsx:220` — all `bg-punch`/`bg-grape` paired with
hardcoded `text-white`. Per §1's fill-contrast rule this is wrong at night
regardless of which primary-job option wins (§1) — a hardcoded light text
colour on an accent fill is the same shape of bug that was already found
and fixed once at v1 (teal-at-night, 2.35:1, failed AA).

**Fix**: replace `text-white` with a class that resolves through the
themed fill/ink pair, not a literal — point these four at the existing
`.vote-primary-action`/`.plan-submit` component classes, which already
carry `--primary-fill`/`--primary-ink` and, once §1/§2 land, will resolve
correctly in both grounds automatically. Do not hardcode a specific ink
value here; the whole point is that day and night take opposite ink
colours on this fill (§1's Fill contrast note) and a literal can only be
right in one of them.

---

## 4 — Dead code: confirmed zero-reference, safe to delete as a checklist

Re-verify each is still zero-reference immediately before deleting (cheap,
and confirms nothing changed since the audit) — this is a checklist Frontend
can execute directly, not a "please double-check" ask.

**`app/globals.css`**, ~330 lines, zero `.tsx` references: `.home-noise`,
`.home-orb`/`--one`/`--two`, `.home-stage__glow`, `.home-decision-orbit`,
`.home-orbit-copy`, `.home-orbit-core`(`__number`/`__label`),
`.home-float-card` family, `.home-scribble`, `.home-proof`, `.home-ticker`
(`__track`), `.home-stats`, `.home-stage-index`, `.home-stage-note`, plus
their `@media` overrides.

**Two files, fully dead**: `components/ui/input.tsx` (unused shadcn
component). **Not** `components/kokonutui/action-search-bar.tsx` or
`components/kokonutui/card-stack.tsx` — unused today, but §5 wires both in;
do not delete.

**`lib/dubai-phase.ts`, `components/ThemeSync.tsx`** — see §2, deleted as
part of the colour-mechanism removal, not this general sweep (called out
there because the reasoning is specific, not because it's a separate task).

---

## 5 — Home rebuild remainder (10a)

Structural work, sequenced after §1-§4 fix what's actively broken.

- **Sticky header**: wordmark, search field (wire in
  `components/kokonutui/action-search-bar.tsx` — already built, already
  re-tokenised, currently unused), presence indicator, avatar. `20px 40px`
  padding, `background: rgba(18,18,18,.86)` + `backdrop-filter: blur(14px)`,
  1px bottom hairline in `--color-card`. This becomes the sticky element
  that actually sticks once §3.3 lands.
  **Before wiring it in**: strip `lucide-react` out of it first (see §7 —
  the owner's anti-vibecoded list explicitly flags Lucide icons, and this
  is currently the only consumer of the dependency in the whole repo). Its
  seven action-item icons become text-only rows; its example actions are
  generic registry-template content (flight booking, analytics, video call)
  that doesn't belong in this product — replace with plan-ind-relevant
  examples ("Search a place, a night, or a person" per the original 10a
  spec) rather than porting the placeholders forward.
- **Deck panel**: wire in `components/kokonutui/card-stack.tsx` (already
  built, already re-tokenised, currently unused) as "the deck" — nine places
  across three rounds, matching the product's real mechanic. Replaces the
  `.home-system` illustration entirely rather than re-theming it in place.
- **Hero row**: `minmax(0,1fr) 340px` grid, gap `34px`; left is the current
  plan card, right rail is the deck panel above plus a live list and streak
  note (the streak note is exactly where §1's gold accent belongs — "4-week
  streak", used once).
- Real data where it exists, honest empty states where it doesn't — the
  handoff's original rule, unchanged by the colour reset.

## 6 — Place page (12a)

Still nothing at `app/place/[id]/page.tsx` — no venue detail page exists.
Spec (grid, four-source photo priority, no-tour state, "shot by your
friends" rail) carries over unchanged from the original Claude Design
handoff research; only the colour tokens change to §1. Full detail in the
archived Wave-1/handoff section below (radii, spacing, breakpoints) — reread
those numbers against §1's tokens, not the retired sand/teal ones.

---

## Verification (for whoever implements this)

- Re-run every grep in this document immediately before acting on it —
  `dubai-phase`/`ThemeSync` consumers (§2), the `[data-theme="night"]` count
  (§2), the dead-code zero-reference claims (§4) — audits go stale.
- Contrast-check every accent-on-fill pairing with `getComputedStyle` in a
  real browser after implementing, not just against the values in this doc.
- Confirm `overflow: hidden`'s removal (§3.3) doesn't unclip something
  unexpected — visually sweep `/`, `/home`, `/plan/[id]` at 375/768/1280/1440
  before and after.
- `npm run lint && npm run typecheck && npm test && npm run build` green.

---

# Historical: Wave-1 specs (superseded — colour/token values below are retired)


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

---

## FE.7 — shared vote-page state component

`app/plan/[id]/page.tsx` renders six hand-rolled full-screen blocks (`access`
`captcha` / `error`, `load` `loading` / `notfound` / `error`, plus the implicit
`checking`) in raw Tailwind — `text-3xl font-extrabold`, and one button in
off-standard `rounded-2xl border-2 bg-grape`. T1's `bootstrapPlanAccess()` adds a
typed `PlanAccessDenial` union that needs its own honest screens. Collapse all of
it into one component.

### What it is

`<VoteState>` — a centered full-viewport panel, rendered **inside**
`.vote-experience` (and `.vote-experience--night` when night) so it inherits the
theme and, at night, the After Dark ground + halo already on that class. It is the
first thing a guest on a bad or paused link sees, so it has to look like the
product, not a stack trace.

```tsx
<VoteState
  kind="loading" | "captcha" | "guest-paused" | "retry" | "cold-link"
  planTitle={plan?.title}      // shown when known (loading, retry-after-load)
  onRetry={() => …}            // required for kind="retry"
>
  {/* kind="captcha" only: <Turnstile action="plan-access" onVerify={…} /> */}
</VoteState>
```

Five kinds, mapped from the page's existing unions + the denial reasons:

| `kind` | Fires for | Title | Body | Action |
|---|---|---|---|---|
| `loading` | `access === "checking"` · `load === "loading"` | *Loading the plan…* (or *Loading {planTitle}…* when known) | — | none |
| `captcha` | `access === "captcha"` · `PlanAccessDenial: captcha-required` | Open this plan securely | One line: a quick security check keeps the live vote clean. | `<Turnstile>` in the slot |
| `guest-paused` | `PlanAccessDenial: anonymous-disabled` | Guest voting is paused | **This link works** — the host just needs to switch guest access back on. Ask them to check, or sign in to vote. | secondary: **Sign in** → `/login` |
| `retry` | `access === "error"` · `PlanAccessDenial: sign-in-failed \| claim-failed` · `load === "error"` | This plan wouldn't open | The connection dropped before the plan loaded. Try again. | primary: **Try again** → `onRetry` |
| `cold-link` | `load === "notfound"` · `PlanAccessDenial: not-found` | This link's gone cold | The plan isn't here anymore. Ask whoever sent it for a fresh link. | none |

`guest-paused` is the load-bearing one: it must never read as "you have a bad
link." The user did nothing wrong — our B1 toggle is off.

### Colour — none

A state screen is not "you / now", not "the outcome", not a category identity, so
per the colour system it earns **no hue**: graphite ink on the ivory (or obsidian)
ground, full stop. Two consequences:

- **Do not** set `data-group` on the state panel, and **do not** use `.vote-kicker`
  (it is `--color-punch-text` — champagne, reserved for the outcome). If an
  overline is wanted, it is `--color-muted`.
- Even `retry` after the plan row loaded — where the category *is* known — stays
  colourless. The group hue belongs to the vote content, not the error chrome.

The only accents on screen are inside `.vote-primary-action` (the "Try again"
button — ink fill + the signature token shadow, which is correct: it is a commit
action) and `.vote-secondary-action` ("Sign in" — ghost/underline).

### Layout & tokens — a `.vote-state` block in `globals.css` (T2 writes it)

Keep the layout the six blocks already share; give it real tokens.

```css
.vote-state {              /* on the <main>, alongside .vote-experience */
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 2rem 1.25rem;
  text-align: center;
}
.vote-state__inner {
  max-width: 22rem;
  animation: vote-round-in 400ms var(--ease-settle) both;  /* reuse the keyframe */
}
.vote-state__over {        /* optional overline — muted, never champagne */
  font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--color-muted);
}
.vote-state__title {
  margin-top: 0.5rem;
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 5vw, 2rem);   /* not text-3xl — matches the type card's .t-title */
  font-weight: 800; letter-spacing: -0.02em;
  color: var(--color-ink);
  text-wrap: balance;
}
.vote-state__body {
  margin: 0.75rem auto 0;
  max-width: 34ch;
  font-size: 0.95rem; line-height: 1.5;
  color: var(--color-muted);
}
.vote-state__body strong { color: var(--color-ink); font-weight: 700; }
.vote-state__actions {
  margin-top: 1.5rem;
  display: flex; flex-direction: column; gap: 0.75rem; align-items: center;
}
.vote-state__slot { margin-top: 1.5rem; }   /* Turnstile wrapper */
```

- Primary action: reuse `.vote-primary-action` unchanged — **delete** the
  `rounded-2xl border-2 border-ink bg-grape px-6 py-3 … text-white` utilities on
  the current `load === "error"` button; the class already carries the fill,
  radius, and token shadow.
- Secondary action ("Sign in"): reuse `.vote-secondary-action`.

### Motion — entrance only, nothing ambient

- The panel enters once via `vote-round-in` (translate + fade, `--ease-settle`).
  One-shot; the global reduced-motion `transition/animation-duration` override
  neutralizes it.
- **`loading` is text only — no spinner, no pulse.** "Communicate status with
  clear text" (Visual direction §); a looping indicator is a status light. At
  night the After Dark halo is already the screen's one ambient loop; a loading
  shimmer would be a second one *and* would carry information, failing ambient
  rule 3. If liveness ever feels needed, a single 2s fade of the title that
  settles — not a loop — but ship text-only first.
- Do **not** add the `.vote-round-label` rules, the leader sheen, or a second halo
  to a night state screen. It sits on the inherited After Dark ground and adds
  nothing of its own.

### Icons — none

There is no icon library in the repo (`package.json`, no `lucide` / `heroicons` /
`react-icons`; no SVG in `components/`). The standards ban improvised SVGs, so the
kinds differentiate by **headline and copy**, not a glyph. If an icon set is added
later, one 24px stroke mark per kind (`cold-link`, `guest-paused`, `captcha`) can
be revisited — not `loading` or `retry`.

### Verification

- Force each `kind` (temporarily hard-set the state) at 375 / 768 / 1280, day and
  night: copy wraps cleanly, the panel is vertically centered, no horizontal
  scroll.
- `guest-paused` reads as "our fault, not yours" — check the wording lands.
- Keyboard: "Try again" / "Sign in" reachable, graphite inset focus ring.
- `prefers-reduced-motion`: panel appears with no slide.
- Turnstile still mounts and verifies inside `kind="captcha"`.
- `a11y-responsive` pass — each state has one `<h1>`, the panel is not an
  `aria-live` region unless `loading` → `ready` needs announcing (it does:
  `role="status"` on the loading panel is fine, it is text).
