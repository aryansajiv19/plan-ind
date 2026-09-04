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

> **Citation fixed 2026-09-04.** This section used to point at
> `design_handoff_plan/README.md` and "the archived Wave-1/handoff section
> below" for the actual layout detail. Neither exists — the README was
> never committed to this repo (it only ever lived in the Claude Design
> project itself), and the archived section below has no place-page
> content at all. Frontend hit exactly that dead end building this and
> correctly shipped the honest schema-scoped version instead of guessing —
> right call, see the schema-reality note at the bottom. The detail below
> is inlined from my own working notes (not previously in any committed
> file) and rewritten onto current tokens, so this is now the actual source
> rather than a pointer to one.

New route `app/place/[id]/page.tsx` — no venue detail page exists yet as of
this writing.

- **Layout**: grid `minmax(0,1fr) 400px`. Left column: 460px hero photo
  with the standard photo scrim (`var(--photo-scrim)`, same as photo-wall
  tiles), name at `2.1rem` in the display serif, one detail line
  (`neighbourhood · price a head · the slot left`), and a source chip
  reading "From the venue" when the photo is venue-supplied. Below that: a
  tab row (Photos / 360 tour / Your friends / Menu — build with shadcn
  `tabs`, §7), a three-up 150px photo grid, and a 360-tour panel at 280px
  height with a `1px solid var(--color-line)` hairline border, "Enter the
  tour" as the primary CTA and "Full screen" as secondary.
- **The no-tour state is a first-class deliverable, not a fallback.** When
  no 360 tour exists: a panel with a dashed `var(--color-line)` border that
  plainly states what's missing, showing whatever guest photos do exist
  underneath rather than leaving a gap. This is informational content
  about a missing *feature*, not a "no photo" placeholder — doesn't
  conflict with §8's no-empty-photo-frame rule, which is specifically
  about photo slots.
- **Right rail, "Shot by your friends"**: per-photo avatar (shadcn
  `avatar`, §7) + name + date + rating if given, then the post-night
  upload prompt, then the rights note (guest-submitted photos need a
  visible "these are from your group" attribution, not presented as venue
  photography).
- **Photo-sourcing priority is product policy, not a UI detail**:
  venue-supplied → embedded 360 tour (never copied/re-hosted) → the
  group's own guest photos → licensed editorial as a floor.

**Schema reality, unchanged since the original research**: `Spot.photo_url`
(`lib/types.ts:26`) is the only photo field that exists today — no
`tour_url`, no guest-photo table, no menu data. Most of the page above
therefore has nothing to render yet and should say so plainly rather than
pad the layout — this is the expected, correct state until those columns
land, not a bug. **If Frontend already shipped a scoped version** (single
photo source, tabs/360/friends/menu omitted rather than faked) that is the
right interim call and does not need to be redone — this full spec is the
target for when the underlying data exists, not a corrective for what
shipped without it.

## 7 — Component library: shadcn + Motion, and the animation direction (owner, 2026-09-04)

Full rationale and reversal history in `FRONTEND_DESIGN_STANDARDS.md`'s
Components/Motion sections — this is the build checklist.

- **lucide-react resolution** (closes the §5 forward-reference above): drop
  it. `components/kokonutui/action-search-bar.tsx`'s seven action icons go
  text-only per §5's own note; confirm no other consumer exists
  (`grep -rn lucide-react` across `app/**`/`components/**`) before removing
  the dependency from `package.json`.
- **shadcn primitives to use for the still-open build-out** — install via
  the shadcn CLI against this repo's `components.json`
  (`style: new-york`, `baseColor: neutral`, `cssVariables: true`, so it
  re-tokens onto `--color-*` automatically) rather than hand-rolling:
  - `tabs` → the place page's Photos / 360 tour / Your friends / Menu row
    (§6).
  - `avatar` → the sticky header's presence stack (§5) and the place page's
    "shot by your friends" rail (§6).
  - `badge` → the streak note (§5) and any premium marker (Colour job 3).
  - `button` → only for genuinely new CTAs; the app's existing primary/ghost
    button classes stay as-is, don't replace them wholesale.
- **Shared-element transition, card → place-page hero** (§6): Motion
  `layoutId` keyed by spot id, shared between the photo-wall tile /
  place-card photo and the place-page hero photo. ≤350ms, `--ease-settle`.
- **Hero scroll-parallax** on the place page's 460px hero photo (§6): image
  layer moves at ~0.85–0.9× scroll speed inside the hero's own clipped
  bounds. Disable under `prefers-reduced-motion`.
- **Press feedback: no-bounce sweep.** `--ease-spring` (`app/globals.css:81`)
  currently drives `:active`/tap transitions at lines 285, 998, 1553, 1819,
  2434, 2559, 2669 — every one of those becomes `--ease-settle`, scale-only
  or fade+scale, no overshoot past `scale(1)` on release. Global sweep, not
  per-component discretion — verify each site is actually press feedback
  (not, e.g., a hover state) before changing it.
- **Shimmer skeleton.** `.wall-skeleton` (`app/globals.css:3518`) is a
  static flat block today — no animation. Add the diagonal shimmer sweep
  spec'd in `FRONTEND_DESIGN_STANDARDS.md`'s Motion section (~1.6s loop,
  ground-aware highlight colour, contrast-checked per ground like every
  other value in this doc). Audit for any other static skeleton/spinner in
  `app/globals.css` and apply the same treatment.
- **No confetti/sparkles/gamified pop-ups** on the streak/premium-badge
  feature or any future milestone moment — state communicates through the
  existing colour/type system only.

**Density note, ties to the Visual direction reconciliation in
`FRONTEND_DESIGN_STANDARDS.md`**: "minimalistic aesthetic luxury" reads as
restrained and considered, not sparse — none of the above should be used to
justify emptier layouts. Adding a shadcn primitive or a shared-element
transition is about polish and restraint in *how* something is built, not
about showing less.

## 8 — No visible empty photo frames (owner, 2026-09-04)

`components/PhotoTile.tsx:78-80` renders a `.wall-tile__absent` label — "No
photo yet", uppercase, top-left of the photo-less tile
(`app/globals.css:3476-3485`) — whenever `spot.photo_url` is null. That's a
labeled gap, exactly what the owner now says not to show: *"don't render a
visible placeholder box... either omit the slot entirely, or fall back to
something that reads as designed... never a blank/bordered rectangle."*

The good news: the tile's actual photo-less fallback (`.wall-tile--typographic`,
`PhotoTile.tsx:46-70`) already **is** the "text-only card" the owner asks
for — venue name in the display serif, the vibe line under a hairline rule,
no image at all. That part stays exactly as-is; it was already designed for
this, not a placeholder. **The only thing to remove is the "No photo yet"
label itself** — delete `PhotoTile.tsx:78-80`'s `<p className="wall-tile__absent">`
block and the now-unused `.wall-tile__absent` rule
(`app/globals.css:3476-3485`). The tile keeps its 1px hairline border
(`.wall-tile--typographic`, `:3450`) — that's this design system's normal
card treatment everywhere, not a "broken image" indicator, so it doesn't
read as the rectangle the owner is flagging.

No other component currently shows a labeled/bordered empty-photo state —
`AccountViews.tsx`'s place card (`:201`) and the place-page hero (§6, now
shipped) use the same typographic-fallback pattern; confirm neither grew its
own "no photo" label independently before calling this done.

## 9 — Full-route-surface confirmation (owner Scope note, 2026-09-04)

Checked every route the owner named against what's actually in the repo,
not assumed. Two different situations, both real:

**Already covered, no extra spec needed** — confirmed clean by direct grep,
zero hardcoded hex/`text-white`/`bg-{gray,slate}-*` in any of them:
`components/AccountViews.tsx` + `DemoAccountViews.tsx` (all five `app/home`
tabs — Plan, Discover, Been, Friends, Profile — style purely through
`--color-*` custom properties already), `components/AuthForm.tsx`
(`app/login`), `components/AgeForm.tsx` (`app/onboarding`),
`components/VoteState.tsx` (the `app/plan/[id]` loading/captcha/
guest-paused/retry/cold-link states — already "colourless graphite" per
FE.7, so §1's repoint doesn't even change these visually). §1's token
repoint plus §3.9's four-item `text-white` fix (`app/plan/[id]/page.tsx`,
`NameGate.tsx`, `DecidedPlan.tsx`) is the complete fix for the whole
`app/plan/[id]` surface, including `DecidedPlan`'s payoff screen — nothing
further to spec here, but **do visually confirm it** (see Verification
below) since "the tokens should cascade" and "it actually looks right" are
different claims.

**A real, previously-unflagged gap — confirmed by running `npm run build`,
not guessed:**

```
Route (app)
○ /home-preview   (Static)
○ /privacy        (Static)
○ /terms          (Static)
ƒ /               (Dynamic)   ← correct, no flash
ƒ /home /login /onboarding /plan/[id]   (Dynamic)   ← correct, no flash
```

`app/layout.tsx:83` calls `autoGround()` (`lib/dubai-phase.ts:45`, plain
`new Date()`, no request-scoped API) to stamp `data-theme` server-side
specifically so there's no sand-to-black flash on first paint (see the
comment at `app/layout.tsx:79-81`). That reasoning only holds for routes
Next actually renders per request. `/home-preview`, `/privacy`, and
`/terms` have no dynamic API anywhere in their tree, so Next prerenders
them once at **build time** — `autoGround()` runs once, whatever hour the
build happened to run, and that ground is baked into the static HTML for
every visitor after, corrected only by `ThemeSync`'s client-side effect.
That's exactly the flash the server-stamping exists to prevent, live on
three routes — most visibly on `/home-preview`, which is meant to *show*
the design.

**Fix**: add `export const dynamic = "force-dynamic";` to
`app/home-preview/page.tsx`, `app/privacy/page.tsx`, and
`app/terms/page.tsx`. None of the three do expensive data fetching
(`home-preview` is fixture-only, `privacy`/`terms` call `getLegalConfig()`
which is static config, not a network call) so there's no real cost to
losing static caching — this matches how `/` already behaves. Re-run
`npm run build` after and confirm all three flip from `○` to `ƒ` in the
route table.

## 10 — Direct plan: skip the vote (owner feature, `PRIORITIES.md`)

New second entry point: someone who already knows the place locks it in
immediately instead of deal-and-vote. Detail table (budget/age already have
data, weather/open-now are free-tier adds, transportation ties to the
travel-time scope decision) is in `PRIORITIES.md`; this section is the
Design half — the entry-point flow and the carpool scoping question,
per that doc's assignment. Backend confirms the creation-path mechanics
(`pool_count = 1` vs. a separate path) against what's specced here; Frontend
builds after both land.

### 10.1 — Entry point: two paths in, one flow out

Both land on the same immediately-decided plan, not a variant flow with a
skipped step — the difference is only how the plan gets created:

- **From a place page** (`app/place/[id]/page.tsx`, just shipped) — this is
  the primary path, since it's exactly where "I already know this place"
  happens: someone's browsing Discover, lands on a spot, and wants to lock
  it in. Add a second CTA next to whatever the page's existing primary
  action is: **"Plan it here, skip the vote"** (ghost-button weight, not
  competing with the page's existing primary action — this is the less
  common path even though it's a real one). Tapping it opens the same
  plan-creation surface `StartPlanForm` uses for date/time/origin/budget
  radius, pre-filled with this one spot, then creates the plan directly in
  a decided state — no deal, no rounds.
- **From `/home`'s Plan tab** — a secondary, lighter path for "I have a
  shortlist, not one exact place yet": a toggle at the top of
  `StartPlanForm` itself, **"Deal three rounds" / "I already know where"**.
  Picking the second reveals a spot search/select (reuse whatever search
  component the smart-search bar already provides) instead of the
  category/vibe pickers, then the same date/time/origin fields, then
  creates directly.
- **Both converge on the same creation call** — one door via search, one
  via a specific spot's page, same immediate-decision outcome either way.
  Nothing about the payoff screen (`DecidedPlan.tsx`) changes; a direct
  plan lands there exactly like a voted-through one does, just without a
  vote history above it.

### 10.2 — Carpool coordination: the open scoping question

**Proposal, not a build order — this needs the owner's sign-off before
Backend schemas anything.** The lazy-correct shape given what already
exists: **extend the existing `rsvps` table, don't build a separate
matching system.** `rsvps` (`supabase/schema.sql:178`) already has one row
per plan per voter with a `choice` field (`coming`/`maybe`/`no`) — the
natural fit is a second, independent field on the same row:

- `transport text check (transport in ('driving', 'need_ride', 'own_way'))`,
  nullable (no answer given yet, most common state until asked).
- `seats_available smallint`, nullable, meaningful only when
  `transport = 'driving'`.

**What the UI does with it — a list, not a matcher.** The payoff screen
(`DecidedPlan.tsx`) gets a "Getting there" section: who's driving and how
many open seats, who needs a ride, who's making their own way — a plain
list, sorted drivers-with-open-seats first. **The app does not assign who
rides with whom** — that's a group-chat decision, not a feature; auto-
matching riders to drivers is a real product (seat counts, pickup order,
timing) this app has no reason to become. This keeps the scope to "surface
who needs what," which is genuinely new UI but reuses the RSVP write path
(`cast_plan_vote`'s sibling RPC for rsvps, already security-definer'd —
Backend confirms the exact function) rather than inventing new
infrastructure.

**What this explicitly does not do**, so nobody builds past the actual
ask: no route optimization, no automatic driver/rider pairing, no
capacity enforcement (a driver can be shown as "full" but nothing stops
someone RSVPing to ride with them anyway — the list is coordination, not
a booking system).

## 11 — Bold-text sweep (owner, 2026-09-04)

Rule is in `FRONTEND_DESIGN_STANDARDS.md`'s Typography section (weight
tiers: 700 for one primary action + genuinely load-bearing numbers/names,
500 for everything else, 400 body). This is the mechanical sweep, not a
selector-by-selector redesign — `app/globals.css` has 76
`font-weight: 700`/`800` declarations; re-deciding each individually would
cost more than it's worth. Bucket by pattern instead:

- **Drop to 500 (medium)** — the large majority of the 76. Every
  `font-weight: 700` on: a `label`/`legend`/uppercase kicker-style
  selector (grep for `text-transform: uppercase` on the same rule or its
  neighbor — a strong tell), a secondary/ghost/filter/tab button (any
  button that isn't the screen's one primary action), meta/muted text
  (`color: var(--color-muted)` on the same rule is the other tell). These
  two greps together (`grep -n "font-weight: 700" app/globals.css` cross-
  referenced against `text-transform: uppercase` / `var(--color-muted)`
  nearby) will catch the majority of the 76 without hand-classifying each
  one — anything that doesn't match either tell, check by hand.
- **Keep at 700** — the actual primary-action classes
  (`.vote-primary-action`, `.plan-submit`, `.demo-primary-action` only
  where it's genuinely the screen's one primary button, not every
  `.demo-*` button that happens to share the class name pattern), and
  selectors carrying a single load-bearing number/name:
  `.home-system-row__number`, the streak count, `.auth-input--code`
  (already display-family, unaffected by this sweep).
- **Drop from 800 to the tier above** — every `font-weight: 800` on a
  non-display-family selector. Two real exceptions, both already on
  `var(--font-display)` and correctly a logotype/emphasis use, not body
  text: `.auth-mark` (the wordmark chip) and `.auth-input--code` (the OTP
  digit display). Everything else at 800 today is silently clamping
  anyway (`app/layout.tsx` only ships Hanken at 400/500/700) — this sweep
  is also a correctness fix, not just a taste one.
- **Verify, don't assume the buckets are exhaustive**: after the mechanical
  pass, do one visual sweep of `/`, `/home` (all five tabs), `/plan/[id]`
  (each `VoteState` + `DecidedPlan`), `/login`, `/place/[id]` in both
  grounds — confirm each screen now reads with one clear point of
  emphasis instead of five competing ones, and that nothing that
  genuinely needed the weight (the actual primary CTA) got flattened by
  a too-aggressive grep match.

## 12 — Motion: proposals beyond what's built (owner green light, 2026-09-04)

Owner gave an explicit go-ahead for more motion work, Design's judgment,
within the existing constraints (`prefers-reduced-motion`, no excessive
Motion usage, and — real constraint already hit once — **verify any new
rAF-driven effect in a genuinely foregrounded browser tab**, since a
backgrounded/hidden tab never fires `requestAnimationFrame` at all and
will read as "broken" in automated screenshot capture when it isn't;
`AGENT_COORDINATION.md:345` has the prior incident). Four proposals, kept
to what's restrained and purposeful rather than a long wishlist:

1. **The home hero's weight-rise headline is already specced (turn 13,
   300→800 over 1.4s, one-shot) but unconfirmed as shipped** — check
   before proposing anything new here; if it's not built, it's higher
   priority than any of the three below since it's already approved, not
   a new ask.
2. **Photo-wall tile entrance, on scroll into view.** Each tile fades +
   rises 8px as it crosses into the viewport (`IntersectionObserver`,
   not scroll-position math), staggered ~40ms per tile within a row, capped
   at ~250ms total per tile. One-shot per tile — once revealed, stays
   revealed, doesn't replay on scroll-back. This is exactly the kind of
   "purposeful entrance" the existing Motion rules already permit; it's
   new only in that nothing in the wall currently does it.
3. **Round-to-round shared continuity in voting.** When a spot wins its
   pool and carries into the final round, its card currently just
   re-renders in the new position — a hard cut. Give it the same Motion
   `layoutId` treatment as §7's card→place-page transition: the winning
   card visually travels from its pool position to its final-round slot
   instead of disappearing and reappearing. Meaningful because it's the
   one moment in the vote flow that's genuinely progress, not just a
   state change — worth marking as such.
4. **A one-shot confirmation tick, not a toast.** RSVP/vote-cast
   confirmation today is a plain state change. Add a small inline
   checkmark that scales in from 0 to 1 (`--ease-settle`, ~200ms) next to
   the action taken, then stays — no auto-dismiss, no banner, nothing
   that reads as a toast/pop-up. Deliberately stops short of anything the
   no-confetti/no-gamified-pop-up rule (§7) would flag; this is
   acknowledgment, not celebration.

All four: build with Motion (§7's standing rule), respect
`prefers-reduced-motion` by disabling outright (matching `TiltCard`'s
existing pattern, not just shortening durations), and get verified in an
actually-foregrounded tab before being called done.

## 13 — Button padding + focus-outline audit (owner, 2026-09-04)

Two separate claims, audited separately against the actual source, not
assumed — one confirmed as described, one not quite as described but with
a real underlying issue.

### 13.1 — Outline-offset: mostly clean; the flagged instance doesn't match source

Every `outline-offset` in `app/globals.css` was greped and read (14 sites).
**`.home-app-tab:focus-visible` (`:784-790`) already reads `-2px`, correctly**
— contrary to the specific claim that it's `0px`. Don't chase that one
further; either the claim was from a stale build or a different rendered
state, but the source rule is right today.

The **one real deviation** from `components/CLAUDE.md`'s `-2px` rule:
`.home-nav__signin:focus-visible` (`:782`) uses `outline-offset: 2px`
(outward), with a comment (`:778-781`) defending it as deliberate — the
button is filled ink-on-ink, so an inset ring would be invisible, and the
comment claims "the nav has no clipping ancestor and the neighbouring gap
is wider than the ring." **That claim needs re-verification, not blind
trust** — §3 already found real container-width and `overflow: hidden`
problems on this exact nav (`.home-nav`, §3.1-3.3), all discovered *after*
this comment was written. Re-check whether the outward ring still clears
its neighbours and the nav's own edges once §3's fixes land; if it doesn't,
the fix is a wider gap next to this control specifically, not reverting to
an inset ring (which really would be invisible on this fill). The two
`outline-offset: 1px` sites (`:1721`, `:2526`) are inline prose links,
the documented exception — leave them.

### 13.2 — Padding: a real, confirmed systemic gap — two mechanisms fighting for the same class

`.vote-primary-action` is a shared class name used in four places, but
**styled two structurally different ways depending on the call site**,
which is the actual "inconsistent padding" bug, not a scatter of
one-off typos:

- `components/NameGate.tsx:47`, `app/plan/[id]/page.tsx:768,781` — padding
  comes from **Tailwind utilities in the `className` string**:
  `px-6 py-3.5` (1.5rem / 0.875rem), no explicit `min-height`.
- `components/VoteState.tsx:67` — plain `className="vote-primary-action"`,
  no Tailwind padding utility at all. Its size comes entirely from the
  CSS-defined `.vote-state__actions .vote-primary-action` rule
  (`app/globals.css:2132-2139`): `padding: 0.7rem 1.5rem`, explicit
  `min-height: 2.75rem`.

Same semantic button, two independent sizing systems, neither aware of
the other — this is exactly what reads as "inconsistent padding" even
though each individual call site is internally fine. `.demo-*` button
family (`.place-link-importer__field button`, `.demo-filter-tabs button`,
`.demo-collection-tabs button`, etc. — 12+ selectors, greppable via
`grep -n "cursor: pointer" app/globals.css`) has the same shape of
problem at a smaller scale: padding and `min-height` values scattered
with no shared scale (`0.6rem 0.85rem`, `0.45rem 0.7rem`, `.35rem .5rem`,
`0.55rem 0.75rem`, `.75rem 1rem`, and more), each apparently chosen
per-component rather than off a token.

**Fix — pick one mechanism, not both.** Recommend: the CSS class is the
source of truth for size (padding, `min-height`), Tailwind utilities in
`className` stay for one-off layout only (`flex-1`, `w-full`, margins) —
never padding or height on a class that already carries them via
`app/globals.css`. Concretely:
- Strip `px-6 py-3.5` from `NameGate.tsx:47` and
  `app/plan/[id]/page.tsx:768,781` — `.vote-primary-action` already has a
  CSS-defined size via `.vote-state__actions .vote-primary-action`, but
  that rule is **scoped to `.vote-state__actions`**, so these three call
  sites (outside that wrapper) currently fall back to nothing but the
  Tailwind utility. **Un-scope the padding/min-height rule** — move it
  onto bare `.vote-primary-action, .vote-secondary-action` (drop the
  `.vote-state__actions` ancestor requirement) so all four call sites get
  the same `0.7rem 1.5rem` / `2.75rem` from one place, then the Tailwind
  padding utilities become redundant and get removed.
- For the `.demo-*` scatter: define one small padding scale as CSS custom
  properties (e.g. `--btn-pad-sm: .55rem .75rem`, `--btn-pad-md: .65rem
  .9rem`, matching the two most common existing values rather than
  inventing new ones) and repoint every button in the greppable list onto
  one of the two, by size category (compact filter/tab buttons vs.
  standard action buttons) — this is the same "mechanical sweep by
  pattern" approach as §11, not a value invented per selector.
- Re-run the `cursor: pointer` grep after to confirm every clickable
  control's padding traces to a shared token, not a literal.

## 14 — Motion, formally specced: the three owner-approved picks (2026-09-04)

Owner approved three of the §12 proposals, each with a real technical
constraint that changes how it gets built — specced here with those
constraints, superseding §12's item 3 (shared continuity) where it
conflicts.

### 14.1 — Shared-element continuity, scoped to what doesn't cross a hard navigation

Motion's `layoutId` only works within one mounted React tree. A full
Next.js route change (`app/plan/[id]/page.tsx` → a different route,
`HomeExperience`/`PhotoWall` → `app/place/[id]/page.tsx`) unmounts and
remounts the whole tree, so `layoutId` cannot bridge it — and the
alternative that could (React's experimental View Transitions) is canary,
explicitly out of scope. Two cases, two different answers:

- **Pool round → final round (§12 item 3): builds as originally specced,
  unchanged.** Both rounds render within the same mounted vote-flow
  component — no route change, no navigation, `layoutId` works exactly as
  Motion intends. This is the one to build first; it has no open technical
  question.
- **Photo-wall card → place-page hero: DROPPED (owner, 2026-09-04).** The
  intercepting-routes recommendation below was put to the owner as the
  real cost of this piece — not a technical objection, they just don't
  want tile-tap turned into a modal-overlay navigation. Tile-tap stays a
  full page navigation, plain and simple. **Do not build this piece —
  not the intercepting-routes version, not the FLIP fallback either.**
  Kept struck through rather than deleted so nobody re-proposes the same
  thing without knowing it was already asked and declined. Original text,
  for the record only:
  > needs restructuring, not a `layoutId` alone. Today this is a real
  > route change to `app/place/[id]/page.tsx`. Recommended fix: render
  > the place page as an in-page overlay using Next.js Parallel +
  > Intercepting Routes (`@modal` slot + a `(.)place/[id]` intercepting
  > segment under `app/home/` — both stable App Router features, not
  > experimental) when navigated to from within the app (the photo wall,
  > a place card). This keeps the wall mounted underneath the overlay, so
  > a genuine `layoutId` transition works between the tile and the
  > overlay's hero photo. A direct visit or shared link to `/place/[id]`
  > still renders the full standalone page exactly as it does today — the
  > interception only fires for in-app navigation, so nothing about
  > deep-linking or sharing changes. This is a real routing-architecture
  > change, not a CSS/animation tweak — Frontend should weigh in on the
  > restructuring cost before committing to it; if it's a bigger lift
  > than the moment is worth right now, the fallback is a manual FLIP
  > transition (capture the source tile's `getBoundingClientRect()` +
  > photo `src` on click, stash it — `sessionStorage` is enough, no need
  > for real state management — and on the place page's mount, animate
  > the hero photo from that captured rect to its final position). The
  > FLIP fallback gets the same visual result without any routing change,
  > at the cost of being a one-off animation rather than a reusable
  > shared-element pattern.

  The pool-round → final-round piece above is unaffected — build that one
  as specced. Particle-reconstruction (§14.2) and the hero depth drift
  (§14.3) are also unaffected by this drop.

### 14.2 — One-shot particle-reconstruction, scoped to the decided-plan reveal only

**One moment, hand-rolled canvas — not a library, not reusable
infrastructure.** A `<canvas>` sized to the winning spot's hero photo in
`DecidedPlan.tsx`, sampling the actual photo into a coarse grid (roughly
one particle per 6-10px cell — for a 460×300 hero that's on the order of
1,500-2,500 particles, not tens of thousands; keep it capped and measured,
not guessed at build time), each particle starting at a randomized
scattered position and animating to its sampled grid position over
~1-1.2s (`--ease-settle`), revealing the photo by assembly rather than a
plain fade-in. Triggers once, on `DecidedPlan` mount, right as the winner
is revealed — never replays.

**Why this doesn't violate the no-confetti/no-gamified-pop-up rule (§7)
even though it's the most ornamental thing in the app**: confetti is
decorative noise with no informational content, layered on top of a
result that's already shown. This effect **is** the reveal — the actual
venue photo, assembling into its own image, at the one moment in the
product that's genuinely the payoff. Draw the line there explicitly in
code review: if it ever becomes decoration *in addition to* an
already-visible result rather than *how* the result becomes visible, it's
crossed into what's banned.

`prefers-reduced-motion`: skip the canvas entirely, render the photo
already assembled — not a shortened version of the effect, the same
outright-disable pattern as `TiltCard`.

### 14.3 — Front-door hero: scroll-based depth drift (no cursor tracking)

Distinct from `TiltCard`'s existing pointer-parallax (which stays,
unchanged) — this is a **scroll**-driven effect for anyone not hovering
with a mouse at all (most real usage, per the standing mobile-primary
note). Two layers, two rates, both plain CSS transforms driven by one
scroll-position custom property (not a JS animation loop):

- Background/photo layer: `translateY(calc(var(--hero-scroll) * -0.12))`.
- Foreground text/card layer: `translateY(calc(var(--hero-scroll) * -0.04))`
  — moves far less, so the two layers separate rather than travelling
  together.
- `--hero-scroll` updates from a scroll listener (`requestAnimationFrame`-
  throttled, not on every raw scroll event) as a small clamped range (e.g.
  0 to the hero's own height in px, not the full page scroll) — the drift
  should read as depth within the hero, not a full-page parallax effect.
- **Must be clipped to the hero's own bounding box.** §3's audit already
  found one real edge-overflow bug from an uncontained transform
  (`.home-system`/`TiltCard`, §3.4) — this effect needs `overflow: hidden`
  on the hero's own container specifically (not a page-level ancestor,
  which is what caused the sticky/clipping cascade in §3.3) so the two
  layers' drift never leaks past the hero's edges.
- `prefers-reduced-motion`: freeze `--hero-scroll` at 0, effectively
  disabling the drift outright.

## 15 — Collections + moodboards, Pinterest-style (owner, `PRIORITIES.md`)

**Schema correction before anything else.** The ask was framed as "moodboard
tables from migration 010" — checked, and that's not quite right. Migration
010 gives Been's collections real schema (`visit_collections`,
`visit_collection_items`, `visit_photos`, all RLS'd, `visit-photos` storage
bucket live). **Moodboards have no database table anywhere.**
`lib/planning.ts`'s `Moodboard`/`MoodboardItem` types are pure TypeScript,
`localStorage`-only, consumed only by `DemoPlanningTools.tsx` — this is a
fixture, not a thin real feature. That changes what's buildable now versus
blocked, so the two get different treatment below.

**Second correction, this one simplifies the work:** both "thin UI"
features already have a *reasonably well-designed* UI pattern — it's just
sitting in the fixture-only demo components, unconnected to real data.
`DemoAccountViews.tsx` has a working collections bar (tabs, create, assign
a visit to a collection) and `DemoPlanningTools.tsx` has a working
moodboard panel (board tabs, add item by kind, note field). Neither is a
blank slate to design from scratch — the job is mostly **rewire the
existing pattern onto real data**, plus the Pinterest layout the owner
specifically wants, which neither demo currently has (both are today a
plain button-tab bar and a plain item list, not a grid at all).

### 15.1 — Shared masonry mechanism (used by both)

Don't invent a second grid technique — `PhotoWall`'s existing `.wall` /
`.wall__col` (`app/globals.css:3279-3289`) is already a real masonry
implementation: N flex columns (`grid-template-columns: repeat(4,
minmax(0,1fr))`, `gap: 18px`), each column a `flex-direction: column`
stack with `min-width: 0` (load-bearing — prevents intrinsic image ratios
from inflating a track, per `PhotoWall.tsx`'s own comment) and its own
stagger. Reuse this class pair directly for both grids below rather than
building a second CSS masonry system; drop to 2 columns under `max-width:
760px`, 3 under `900px`, matching this file's existing breakpoint scale
(`:2654`, `:2834`).

Tile content reuses `PhotoTile`'s established visual language — the
typographic fallback (`.wall-tile--typographic`) for anything without a
photo, no "empty" label per §8 — rather than a new tile component per
grid. `PhotoTile` itself is typed to `Spot`; generalize it (or add a
sibling tile sharing its CSS) to accept a visit or moodboard item's
shape instead of widening `Spot` to fit content it isn't.

### 15.2 — Been: buildable now, real schema exists

1. **Grid**: replace `.demo-visit-grid`'s uniform 2-column grid
   (`app/globals.css:1872`) with §15.1's masonry, keeping the featured-first
   visit treatment (`.demo-visit--featured`) as the one wide tile in column
   1, everything else flowing into the stagger.
2. **Wire in `visit_photos`** — today completely unused; `AccountViews.tsx`
   only ever shows `visit.spot?.photo_url` (the curated catalog photo, the
   same field that's null for most spots). `visit_photos` is where a
   visit's *own* multiple photos would live, which is what actually makes
   the grid's heights genuinely vary rather than mostly falling back to
   the typographic tile. This needs a real upload control (the storage
   bucket + RLS already support authenticated upload, `:81-84` in the
   migration) — new Frontend build, not just a read. Until it's wired,
   the honest state is what's there today: mostly typographic tiles, a
   real photo where `spot.photo_url` happens to be set. Same "this is the
   common case, not a bug" framing as the photo wall.
3. **Wire in `visit_collections`/`visit_collection_items`** as a filter
   layer above the grid — port `DemoAccountViews.tsx`'s existing collection
   tab bar (`:226-233`) onto real data: list the signed-in person's
   collections, tapping one filters the grid to that collection's visits,
   plus a lightweight "add to collection" action per tile (a `<select>` or
   equivalent, not a new pattern — the demo's `demo-visit__collection-action`
   CSS already exists at `:1880-1883`, unused by real `AccountViews.tsx`
   today, ready to repoint). **Check with Backend first**: `visit_collections`
   currently grants direct `for all to authenticated` RLS
   (migration 010, not RPC-gated) — confirm that's the intended pattern here
   or whether it should move to a security-definer RPC to match the
   `votes`/`rsvps`/`ratings` no-direct-write convention (`CLAUDE.md`
   invariant) before Frontend builds against it either way.

### 15.3 — Discover moodboards: layout ready, data genuinely blocked

The masonry mechanism (§15.1) applies identically here, and the item-kind
model already in `lib/planning.ts` (`place` / `link` / `photo`, a label +
note) is a sensible target shape — reuse it rather than redesigning. But
**this cannot be wired to real data without new tables first** — there is
nothing in `supabase/schema.sql` for it today. Cross-lane request to
Backend: add `moodboards` / `moodboard_items` tables mirroring
`lib/planning.ts`'s existing shape (id/name/theme/visibility on the board;
id/kind/label/note/optional image+source on the item), owner-scoped RLS
matching `visit_collections`' pattern. Once that lands, Frontend wires
`AccountViews.tsx`'s real Discover tab to it using the same masonry grid
and the demo panel's already-designed interaction pattern
(`DemoPlanningTools.tsx:88`, port don't redesign).

**Until the schema exists, the real Discover tab's honest state is what it
has today** — browse/search/start-a-plan, no moodboard concept — per this
codebase's standing rule against inventing UI for data that isn't there.
Do not wire the real account view to the `localStorage` demo state as a
stopgap; that would be fake data presented as a real feature, exactly what
the honest-empty-state rule exists to prevent.

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
- **Full-surface sweep (§9), both grounds**: `/`, `/home-preview`, `/home`
  (all five tabs), `/login`, `/onboarding`, `/plan/[id]` (loading, each
  `VoteState` variant, an active round, `DecidedPlan`'s payoff), `/privacy`,
  `/terms`, `/place/[id]` once built. Confirm `/home-preview`, `/privacy`,
  `/terms` no longer flash on load after the `force-dynamic` fix — check
  `npm run build`'s route table shows `ƒ` not `○` for all three.
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
