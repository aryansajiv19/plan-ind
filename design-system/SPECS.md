# plan-ind design spec

**Read this page before anything below it.** The file grew across a long
sequence of owner revisions — the palette alone went through seven — and
several sections describe values that are *deliberately dead*. Reading a
superseded number as live is the main way this document can hurt you.

## What is current

| Topic | Live section | State |
|---|---|---|
| **Palette** | **§19 (v7)** | The owner's six hexes. Everything earlier is superseded. |
| Boundary + text floors | §19.7 | Live and binding. Text ≥4.5:1, component boundaries ≥3:1. |
| Radii | §19.4 | Live. `--radius-control: 10px`. |
| **Ground + elevation** | **§24** | **Live. Canvas `#051822`, cards `#0B2836` (ΔL\* 7.47). Supersedes §23.1's grounds AND its rule.** |
| Dark tokens | §23.2 + §24.4 | Live. `--canvas`/`--card` come from §24; every other token from §23.2. |
| Energy / type scale | §23.4 | Live. Energy is scale, motion, density — never more colour. |
| **Interaction** | **§25** | **Live. Plan gravity + the voting moment. Layout, not physics.** |
| **Atmosphere + social** | **§26** | **Live. Ambient light, held seats, category field, the finished type scale.** |
| Winner reveal | §25.1 + §14.2 | Live. The canvas is the transition; **real DOM text is the destination**. |
| **Focus ring** | **§23.7** | **Live. Two bands, inset. §19.7's graphite ring is superseded for dark.** |
| Light mode | §23.8 | **Parked, not deleted**, 2026-09-07 — the mirror of §19.2. Two pin sites. |
| ~~Dark mode parked~~ | ~~§19.2~~ | **Superseded 2026-09-07 by §23.** §19.2's machinery is a starting point for *structure*; its values are v5-era. |
| Colour placement | §21 | Live. Colour by component role. |
| Spacing distribution | §22 | Live, and owner-approved after seeing it. |
| Italic | §20 | Live. Cormorant is confirmed and both faces are vendored. |
| Wave-1 (`FE.*`) | foot of file | **Archived.** Component APIs still hold; **colour does not**. |

## Do not restore these — they were withdrawn on purpose

- **Palettes v1–v6.** v5 (`#442816`/`#704121`/`#AB6F44`…) and v6
  (`#7D9BBC`/`#F2F2F2`/`#CE9963`/`#9F7652`/`#3F230B`) are both dead. v6
  died because it had **one** text-capable colour, which forced an
  awkward derivation; v7 has three in light and three in dark.
- **The derived accent `#7A5A3E`** (§19.1a). Retired because v7's own
  brown `#7C5841` carries small text natively. **We ship no colour the
  owner did not pick** — that rule is why this was removed rather than
  kept for convenience.
- **`--color-accent-premium`** (§19.6). Zero consumers, and the feature it
  named was never built.
- **"A fill stands in for a missing image"** (§21.2). This was elegant and
  it is **withdrawn, not forgotten**. Photo presence is a *per-instance*
  condition, so filling photo-less cards reproduced the exact scatter the
  owner rejected, just keyed on a different variable. Only its constraint
  half survives: a fill never sits on a photographed surface.
- **Colour keyed to category, price or any datum** (§21.5). That is the
  retired category rainbow.
- **"Emphasise white heavily" / the white-dominant light-only brief.**
  Reversed **2026-09-07** — the owner called the near-white ground
  monotonous, and §23.1 measures why it was always going to read that way
  (canvas and card differed by ΔL\* 3.34). See §23.0; this is a decision,
  not drift.
- **"No dark mode, hold it back."** Reversed **2026-09-07** — dark is now
  the identity (§23). The six values were chosen *before* dark was asked
  for and two of them are proper darks, which is why this is a correction
  rather than a new direction.
- **A card sitting `#2D383E` on a `#051822` canvas** — a **15.54** ΔL\*
  lift. It leaves `--muted` failing at 4.24, which is the card's meta ink on
  every venue card. **Note this entry was previously written as "cards
  lighter than the canvas", which was wrong** — direction is free, magnitude
  is not (§24.1). The live arrangement (§24) *does* put cards above the
  canvas, at ΔL\* 7.47.

## Two decisions worth not re-litigating

- **`--color-muted` takes the secondary ink, not v7's grey.** The token is
  read as `color:` in ~90 rules, so it must be text-capable; grey is 2.83
  on white and fails.
- **v7's grey `#969A9E` gets no token in light**, because nothing renders
  it there. A token with no consumer is how `--color-accent-premium`
  happened. **Superseded for dark by §23.2**, where grey is both the
  card-interior meta ink (6.39) and the boundary hairline — it has real
  consumers, so it gets a token.

## The measurement rule that kept catching real bugs

> **Quote every figure against the grounds the app actually renders,
> never against pure white.**

This is not a style preference. A value can pass against white and fail on
both real grounds — `#998F8A` measured 3.16 against white, then 3.03 on
card and **2.79 on canvas**. That pattern nearly shipped the owner's own
"things blend into the background" complaint back to them **twice** in one
day. Related: a **contrast ratio** and a **lightness difference (ΔL\*)**
disagree on exactly the pairs that look alike, so use ΔL\* for
surface-vs-surface separation and the ratio for text. Conflating them
produced a wrong call three times.

Everything below is written for implementation without a follow-up
question: exact selector, exact current value, exact replacement, and a
file:line anchor.

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

**⚠️ AMENDED 2026-09-07 — the subject changed from a photo to text
(§23.9b), and three things above do not survive that change unaided.**
Shipped as `WinnerReveal` (`72af888`). Anyone re-deriving from the
particle cap alone inherits a real bug, which is why this is recorded here
rather than only in §23:

0. **THE GENERAL RULE, after three instances: particle count is a function
   of glyph coverage, and anything that changes how the subject is sized
   changes it.** Photo → type was the first re-derivation; long name → short
   name was the second (a viewport-keyed size made coverage vary with name
   length, dropping `3Fils` to **280** particles while
   `Reif Japanese Kushiyaki` held 1,142); §25.1's matched sizing is the
   third. **The cap is a ceiling, never a recipe.** Whenever the subject or
   its sizing changes, re-measure coverage across the *real catalogue* —
   short names and long ones — and floor it. Frontend's fix is the right
   shape: names under ~500 particles are re-sampled at a 1px cell, restoring
   them to ~1,100, in two walks of one 400×220 buffer before any frame. **The
   grid stays 400×220; only the cell changes.**
1. **Density is a function of coverage, not of the cap.** The 1,500-2,500
   figure was correct *for a full-bleed photo*, where ink covers the whole
   box. Type covers a fraction of it, so the inherited 7px cell yields
   **45-87 particles** for real venue names — scattered dots that never
   resolve into a word. **The cap never implied a cell size; it only ever
   held for one subject.** At 2px cells with a 96px ceiling the live
   catalogue measures **776** ("Museum of the Future", shrinking to 38px to
   fit) to **1,232** ("Brasserie 2.0" at 70px) — comfortably inside the cap,
   reached by measuring the real catalogue rather than by reasoning from it.
2. **The canvas draws in a fixed 400×220 space scaled by CSS.** The crisp
   text that replaces the particles must be sized against *that* box, or
   the reveal ends on a visible jump — on the one screen that must not have
   one. Verified by measuring rendered against reconstructed (142px against
   142px, 79 against 79), not by reasoning.
3. **It must wait on `document.fonts.ready`.** Sampling before the display
   face loads reconstructs the *fallback* serif and then settles to a
   different shape.

**What the swap deleted, and this is the point:** reconstructing the name
needs no cross-origin fetch, so `getImageData()` cannot taint the canvas
and the whole fallback path is gone. It now runs on **every** decided plan
instead of the ~7% with a photo, and still settles onto the photo when one
exists. **The rewrite removed code rather than adding it.**

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
   today, ready to repoint). **Resolved with Backend (2026-09-04):** the
   direct `for all to authenticated` RLS on `visit_collections`/
   `visit_collection_items` is intentional, not the `votes`/`rsvps`/
   `ratings` bug class — those go through RPCs for multi-party shared
   state on a group plan (idempotency, membership races); this is pure
   single-owner personal data via an ownership join, the textbook-correct
   pattern for its shape. `visit_photos` additionally tiers reads by its
   `visibility` column through a proper join. Build against it as-is, no
   RPC layer needed.

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

## 16 — Anti-vibecoded audit findings (owner, `PRODUCTION_CHECKLISTS.md`, 2026-09-04)

Full page-by-page audit against the anti-pattern list (grep sweep +
live-browser check of `/`, `/home-preview` both tabs, `/login`, `/privacy`,
plus a fresh 404 hit). Two genuine, confirmed hits; everything else checked
clean — reported as such below rather than left unsaid, so this doesn't
get re-audited from scratch next time.

### 16.1 — Missing 404/500 pages: confirmed live

`app/` has no `not-found.tsx`, `error.tsx`, or `global-error.tsx`.
Visited a nonexistent route directly: Next's bare framework default
renders — plain black background, browser-default serif "404 / This page
could not be found," no wordmark, no nav, no way back into the app. Real,
confirmed hit on the anti-vibecoded list's named item.

**Fix**: add `app/not-found.tsx` (triggered by `notFound()` or an unmatched
route) and `app/error.tsx` (client component, catches render errors below
`layout.tsx`) styled to the current system — reuse `.auth-shell`-style
restraint (wordmark, one hairline-bordered panel, a "Back to Deal three"
link), not a new one-off look. `global-error.tsx` additionally replaces
the root layout on a layout-level crash, so it needs its own minimal
`<html><body>` — keep it to plain text plus the same link, no attempt at
full theming since it must not depend on anything that might itself be
broken.

### 16.2 — Hard offset shadow regression on `.vote-option--winner`

`app/globals.css:2371,2376`:
`box-shadow: inset 0 2px 0 var(--vote-metal), 5px 6px 0 var(--vote-metal)`
— the `5px 6px 0` term is a literal hard offset shadow, the exact
`.token` signature `FRONTEND_DESIGN_STANDARDS.md`'s Components section
retired with an explicit reversal note ("turn 8's offset-shadow language
was explicitly rejected as loud... do not reintroduce an offset shadow as
the app's signature depth cue"). This survived because the retirement
swept `.token`-named rules but not every hard-offset value that predates
it under a different selector — the decided/winner vote card was missed.

**Fix**: drop the `5px 6px 0 var(--vote-metal)` term entirely, keep
`inset 0 2px 0 var(--vote-metal)` (a hairline top accent, consistent with
the restraint doctrine) as the winner state's only distinguishing shadow —
matches how depth is handled everywhere else post-retirement (hairline +
restraint, not offset).

### 16.3 — Checked clean, no action needed

Recorded so these don't get re-audited from scratch: no `console.log`/
`TODO`/`FIXME`/lorem-ipsum in `app`/`components`/`lib`; no dead
`href="#"` links; `lucide-react` is fully removed (zero references,
confirms §7's earlier fix actually landed — the "unexamined dependency"
conflict is closed, not open); no fake social-proof strings (the
`DemoAccountViews.tsx` review fixtures are the same honest-demo-data class
as everywhere else in this app, not a "10,000+ users" style claim); no
buzzword copy; no gradient text (`background-clip: text`, zero hits); no
bento-grid layout on any page checked; `data-group`/category-colour-coding
stays retired (one comment reference only, no live usage); day/night
mechanism is alive and under active development, not stripped; spacing on
every page checked reads dense-but-organized, not over-empty.

**One dead-code note, not itself a violation**: `.sky-glow`
(`app/globals.css:467-480`, an animated radial glow) has zero consumers
anywhere in `components/*.tsx` — harmless as dead CSS today, but its name
alone means if anyone ever wires it up later without checking, it directly
violates the no-glowing-borders rule. Flagging so it gets deleted next
dead-code pass rather than resurrected.

## 17 — Transferable consistency principles from Airbnb's token reference (owner, 2026-09-04)

**Not a redesign brief — this is polish on top of the already-approved
direction.** Their coral/white/pill-everything system is explicitly not
being adopted; only the underlying consistency principles are checked
against our own CSS. Four points, audited, not assumed:

### 17.1 — Radius discipline: one real finding

The named token scale (`--radius-ring/thumb/panel/pill/hero`,
`app/globals.css:249-253`) is itself fine — five values, each serving a
genuinely distinct, already-documented purpose (ring photos, thumbnails,
panels, pills, the one asymmetric hero corner), not sloppy. **The actual
gap is that most of the codebase doesn't use these tokens at all**: only
7 of the file's ~40 `border-radius` declarations reference a named token.
The rest are literals, and five of those literals — `0.1rem`, `0.12rem`,
`0.14rem`, `0.15rem`, `0.2rem` — are all doing the same visual job (a
barely-rounded button/input/card corner) on functionally similar controls
(`.home-primary-cta`/`.plan-submit`/`.home-nav__signin` at `0.1rem`;
`.vote-option`/`.vote-result__button`/`.vote-field` at `0.12rem`;
`.vote-toggle` alone at `0.14rem`, no apparent reason it differs from its
neighbours; `.plan-custom-place__saved button`/`.plan-custom-place__editor
textarea` at `0.15rem`; `.plan-deadline`/`.plan-form__input` at `0.2rem`).
13 call sites, 5 near-identical values, no token — this is the real
"not neat" tell the Airbnb reference is naming.

**Fix**: add one token, `--radius-tight: 0.12rem` (splits the difference,
and matches the vote flow — the app's highest-traffic surface), and
repoint all 13 sites above onto it. Two more small literal-vs-token
mismatches while sweeping: `.wall-tile__note` (`:3378`) hardcodes
`border-radius: 20px` for what's already a pill-shaped chip — repoint to
`var(--radius-pill)`. `.home-title strong::after`'s `border-radius: 99px`
(`:949`) is correctly left alone — it's a decorative underline swash
rounding off a thin bar's ends, not a card/button radius, a genuinely
different case the Airbnb principle doesn't cover.

### 17.2 — Full-bleed card images: already matches where it matters, correctly doesn't elsewhere

`PhotoWall`/`PhotoTile` (the actual Pinterest-style tiles this principle
targets) already have zero gap between image and text — the photo fills
the tile edge-to-edge (`overflow: hidden` on `.wall-tile`) and text sits
directly on it via a scrim (`.wall-tile__body`), not below it in separate
white space. **This is real, not a redesign to make.**

Two other card families do have a real image-to-text gap
(`.demo-place-card__body { padding: 1rem 0 1.5rem }`, Discover's live
place-card list; `.demo-visit__content { padding: 1rem 0 1.4rem }`, the
`DemoAccountViews.tsx`-only fixture visit grid, superseded by `PhotoWall`
in the real `AccountViews.tsx` per §15.2) — **neither should change to
match this principle.** They're a different card genre (an editorial
browse-result row with meta and description beneath the photo, not a
photo-first Pinterest tile), and forcing every card in the app into one
photo-tile shape is exactly the "adopt their system wholesale" move this
task explicitly isn't asking for. No action here.

### 17.3 — One accent colour for action only: already matches, no action

Already true — the four-job colour system (Colour, §1) reserves the
accent for the primary/outcome job specifically; it was never used for
backgrounds or headings. Noting alignment, not changing anything.

### 17.4 — Section-title-plus-arrow for horizontal scroll rows: not applicable

There are no horizontal-scroll carousel rows anywhere in this product
today — the photo wall is a vertical masonry grid showing everything, not
a "see all" preview row, and Discover has no carousel sections. Nothing
to audit for consistency because the pattern this principle describes
doesn't exist here yet. If a horizontal row ever gets built (a future
"more like this" rail, say), this is the reference for what its header
should look like — not a retrofit onto anything that exists now.

## 18 — Account-view type is oversized relative to the real hero (owner, 2026-09-04)

Sizing/weight adjustment only, not a typography system change. The
concrete finding is sharper than it first looked: **the account-view
section headings are larger and heavier than the actual front-door hero.**
`.home-title` (`app/globals.css:905-911` — "Dubai plans, without the group
chat.", the real marketing hero) tops out at `clamp(3rem, 1.5rem+4.2vw,
4.75rem)`, weight 500. `.demo-view__header h1` (`:1728-1735`, shared by
Discover/Been/Friends/Profile) tops out at `clamp(2.8rem, 6vw, 5.8rem)`,
weight 600 — bigger and bolder than the hero it's supposed to sit
underneath in the visual hierarchy. Two more specific overrides on top of
that base rule make it worse for genuinely functional content:
`.demo-profile-head h1` (`:1912`) applies that same scale to the plain
signed-in username — a data label, not copy — and `.demo-wrapped h2`
(`:2821`, "Planind Wrapped") applies `clamp(2rem, 4vw, 3.4rem)` to a small
recap card's heading. For calibration: the app's actual emotional-payoff
moment, `DecidedPlan`'s "It's 3Fils." reveal, renders at `text-xl` — 20px.
A profile name at up to 80px next to a real headline moment at 20px is
the concrete mismatch the owner is naming.

**Fix, three tiers, all smaller than the real hero's ceiling of 4.75rem:**

- **`.demo-view__header h1`** (Discover/Been/Friends' real section
  headlines — "Places worth considering.", "The people you actually go
  out with." — these stay as genuine section headers, just resized):
  `clamp(2.8rem, 6vw, 5.8rem)` / weight 600 →
  **`clamp(2.2rem, 4vw, 3.4rem)` / weight 500** (matching the hero's
  weight, sitting comfortably under its size).
- **`.demo-profile-head h1`** (the signed-in name — functional, not
  copy): `clamp(2.8rem, 6vw, 5rem)` →
  **`clamp(1.6rem, 2.5vw, 2.2rem)`**, weight unchanged (600 was never the
  problem here, size was).
- **`.demo-wrapped h2`** ("Planind Wrapped," a card heading inside a
  bordered recap strip, not a section header):
  `clamp(2rem, 4vw, 3.4rem)` → **`clamp(1.3rem, 2vw, 1.6rem)`**.

Marketing/hero surfaces (`.home-title`, the front door, `/home-preview`)
are unchanged — this only touches the four signed-in account-view tabs.

## 19 — Palette v5: brown-led, white-dominant, light-only, smooth (owner, 2026-09-06)

**Supersedes §1's palette v3 wholesale.** Owner's words: prioritise
"white heavily, the gold, black, silver, grey," and **"I wanna emphasise
white, that's gonna be the main colour of the app"** — plus, same pass,
**"I want an aesthetic smooth vibe."** Pointing at the same Airbnb
reference behind §17: white canvas, cards lifting off an off-white
ground, minimal chrome, photography-led.

**Every value below was measured, not asserted** — same method as every
previous palette pass. Ratios are WCAG contrast; `ΔL*` is CIE perceptual
lightness difference, used for surface-vs-surface separation where a
contrast ratio is the wrong tool (see 19.3).

> **Revision history.** This section has been revised twice as the brief
> sharpened: first from gold/black/silver to warm desert (2026-09-04,
> when dark mode was also parked), then to the owner's exact five hexes
> (2026-09-06, §19.1). **Only §19.1's table is live** — earlier values
> named anywhere in this section are superseded and kept solely so the
> reasoning stays legible. What has survived every revision unchanged:
> light-only, the card-lifts-off-canvas model (values per §19.1), the
> radius scale in §19.4, and the two anti-misreading notes in §19.3.

### 19.1 — The palette (v7)

> **Revised 2026-09-06 (fourth revision).** Owner: *"like this palette"*,
> with six labelled swatches. Supersedes v6
> (`#7D9BBC`/`#F2F2F2`/`#CE9963`/`#9F7652`/`#3F230B`) wholesale.
>
> **This one is structurally better than everything before it**, for a
> reason worth naming: it has a real dark end. v6 had exactly one
> text-capable colour, which forced the mono-ink-versus-derived-accent
> question and made us derive a value the owner never picked. v7 has
> three text-capable colours in light and three in dark, all theirs.
> **Only the values move; §19.7's floors, §19.3's separation model,
> §19.4's radii and §21's component rule all stand.**

**Owner's six, independently re-measured — every supplied figure confirms
exactly:**

```
#051822 ink-navy   #2D383E slate   #7C5841 brown
#AA7452 tan        #969A9E grey    #D4C9C7 light
```

| Value | L* / hue | Character |
|---|---|---|
| `#051822` ink-navy | 7.2 · 201° | Near-black with a blue cast. The darkest anchor. |
| `#2D383E` slate | 22.8 · 201° | Desaturated blue-grey. |
| `#7C5841` brown | 40.6 · 23° | Mid warm. **Text-capable — this is the v6 problem solved.** |
| `#AA7452` tan | 53.6 · 23° | Lighter warm. Fill and boundary only. |
| `#969A9E` grey | 63.4 · 210° | Effectively neutral. |
| `#D4C9C7` light | 81.8 · 9° | Warm near-light. See the ground note. |

#### The ground placement — one correction, and it matters

`#D4C9C7` was proposed as the light-theme **canvas**. **Recommend against
it, and use a near-white canvas with `#D4C9C7` demoted to a fill.**
Measured both ways:

| | `#D4C9C7` as canvas | `#F7F5F4` canvas, `#D4C9C7` as a fill |
|---|---|---|
| brown `#7C5841` as text | **3.90:1 — fails** | **5.80:1 — passes** |
| tan `#AA7452` as text | 2.44 — fails | 3.63 — boundary only |
| grey `#969A9E` as text | 1.75 — fails | (decorative) |
| card lift | ΔL* 18.22 — very heavy | ΔL* 3.34 — comfortable |

Making `#D4C9C7` the canvas **costs the brown text accent everywhere text
sits on the page rather than inside a card** — which is most kickers and
section labels. It would quietly reimport v6's one-text-colour constraint
in a milder form, and it contradicts the standing "emphasise white"
brief. Demoting it to a fill keeps **three text colours on every surface**
and turns it into the quiet framing-surface fill §21 needs.

#### Light theme (recommended)

| Role | Token | Value | on canvas `#F7F5F4` | on card `#FFFFFF` |
|---|---|---|---|---|
| Canvas | `--color-paper` | `#F7F5F4` | — | — |
| Card | `--color-card` | `#FFFFFF` | ΔL* 3.34 lift | — |
| Ink | `--color-ink` | `#051822` | 16.65 | 18.10 |
| Secondary ink | `--color-ink-2` | `#2D383E` | 11.06 | 12.02 |
| **Accent text** | `--color-punch-text` | `#7C5841` | **5.80** | **6.31** |
| Boundary | `--color-line` | `#AA7452` | 3.63 | 3.94 |
| Quiet fill | `--color-fill-quiet` | `#D4C9C7` | navy on it 11.19 | — |
| Muted | `--color-muted` | `#969A9E` | decorative only | 2.83 — never text |

#### Dark theme — available, not built

Recorded because it is now a real option rather than an invention. The
owner is *thinking about* dark (§19.2), not asking for it.

| Role | Value | on canvas `#051822` | on card `#2D383E` |
|---|---|---|---|
| Canvas / card | `#051822` / `#2D383E` | ΔL* 15.54 lift | — |
| Ink | `#D4C9C7` | 11.19 | 7.43 |
| Secondary | `#969A9E` | 6.39 | 4.24 — boundary only on card |
| Accent | `#AA7452` | 4.59 | 3.05 — boundary only on card |

#### What reviving dark would cost — the open decision

**Status: the owner is deciding.** They asked to see it
(*"show me the dark theme design"*), and the comparison mock is
`design-system/mocks/dark-theme-v7.html` — light and dark side by side,
three surfaces each, v7 values only. That mock is what makes this
answerable; read it before advising either way.

**The mechanical cost, and it is bounded:** the values exist and are the
owner's own, so this is no longer a palette invention — that was the
original blocker. Retune the ~30 parked night rules (§19.2) off their
v5-era colours, re-audit both grounds against §19.7, and unpin the two
ground-decision points (`app/layout.tsx` **and** `ThemeSync` — both, per
§19.2).

**The design cost, which is the real one, and it is not mechanical:**

1. **Dark card interiors trend mono-ink.** On `#2D383E` cards only
   `#D4C9C7` is legible — grey is 4.24 and tan 3.05, both under 4.5. So a
   card's name and its meta are forced to the same colour. **That is
   precisely the flattening the owner rejected in v6**, reappearing by a
   different route.
2. **§21's default instrument does not survive dark at all.** Brown accent
   text measures **2.87 on the dark canvas and 1.91 on cards**. Dark's
   kickers have to be tan, which works on the canvas (4.59) but would fail
   inside a card.

**So dark is a structurally flatter system than light, not a re-skin.**
Fixing either point means introducing a lighter grey the owner did not
pick — which the rule above (§19.1a's reasoning) says we do not do. That
trade is the decision, and it should be put to them in those terms rather
than as a yes/no on "dark mode."

#### The fill rule, and it is unusually clean

The ink flips at tan, with no exceptions:

- **`#051822`, `#2D383E`, `#7C5841` take white text** — 18.10, 12.02, 6.31.
- **`#AA7452`, `#969A9E`, `#D4C9C7` take navy `#051822` text** — 4.59, 6.39, 11.19.

**Every colour in v7 is usable as a fill**, which v6 was not — v6's brown
had no workable ink at all. That removes the trap that cost three
implementation attempts.

### 19.1a — Retired: the derived accent text is no longer needed

v6 had one text-capable colour, so §19.1a derived `#7A5A3E` to keep the
kicker hierarchy. **v7 makes that unnecessary: brown `#7C5841` carries
small text natively at 5.80 on canvas and 6.31 on card.**

`#7A5A3E` is **withdrawn**. Do not carry a derived colour the owner never
picked when one of their own does the job. The mono-ink-versus-derived
question this section existed to pose is now moot and needs no owner
decision.

### 19.2 — Dark mode: parked, not deleted

> **⚠️ SUPERSEDED 2026-09-07 by §23. Dark is now the identity, and it is
> LIGHT that is parked (§23.8).** Read this section only for its *method* —
> the park-don't-delete discipline, and the two-decision-point warning, both
> of which §23.8 reuses verbatim. **Its night colour values are v5-era and
> must not be used**; §23.2 carries the live dark tokens. This section is
> the reason the reversal cost a spec instead of a rebuild.

Owner: **"no dark mode, or at least hold dark back now, we'll see
later."** This supersedes ~~night retuned to a neutral warm-black as the
subordinate variant~~ above.

**Hold back, do not rip out.** This repo has already been burned once by
exactly this move — night was recommended for deletion, the owner
reversed it, and it had to come back. "We'll see later" explicitly leaves
the door open, so the machinery stays and only the *exposure* goes:

- **Keep, untouched**: `lib/dubai-phase.ts`, `components/ThemeSync.tsx`,
  and every `[data-theme="night"]` block in `app/globals.css`.
- **Stop exposing the path**: remove the night option from the nav
  toggle, and stop the Dubai clock's result from selecting night — pin
  the resolved ground to light, without editing the clock logic itself,
  so the clock stays correct and only its *application* is parked.
- **⚠️ The ground is decided in TWO places, not one.** An earlier draft
  of this section called `app/layout.tsx` "the single point where it is
  decided" — **that was wrong**, and Frontend caught it in
  implementation. Pinning only the server stamp leaves the client
  flipping the document back to night after hydration. Both must be
  pinned:
  1. **Server**: `app/layout.tsx`'s `autoGround()` call, which stamps
     `data-theme` into the markup for first paint.
  2. **Client**: `components/ThemeSync.tsx`'s `resolveGround()` inside
     `apply()` — which runs on mount, **again every 60s via
     `setInterval`**, and on a `storage` event. The interval is the one
     that bites: pin the server only and the app looks correct, then
     turns dark up to a minute later.
- **Comment the park at each site**, in these words or close to them:
  `// PARKED 2026-09-04 (owner: "no dark mode, or at least hold dark
  back now, we'll see later"). Machinery intact and correct; only the
  path that selects it is disabled. NOTE: the ground is pinned in TWO
  places — app/layout.tsx (server stamp) and ThemeSync (client
  re-resolve, incl. a 60s interval). Restoring one without the other
  half-restores dark mode. To restore: re-enable both plus the nav
  toggle. See SPECS.md §19.2.`
- **Do not delete the night colour values** even though §19.1 replaces
  the light ones. If dark returns it will need retuning to the warm
  palette anyway, but a dormant set of values is a starting point and
  deleting them costs the next person real archaeology.

The night values previously specced here are **measured, correct, and
parked with everything else** — recorded so they don't have to be
re-derived if dark comes back: ground `#121212`, card `#1A1A1A`
(ΔL* 3.80), ink `#F5F4F1` (17.03:1), muted `#9A9A9E` (6.68:1), silver
`#C8CBD0` (10.70:1 on card), confirm `#00E0C7` (10.35:1), error
`#FF6B6B` (6.27:1). All were measured against the *old* gold/black
palette, so treat them as a starting point needing a warm retune, not a
drop-in set.

### 19.3 — Smooth: separation by value, not by border

**Read this before "fixing" any low ratio above.** A contrast ratio is a
*text legibility* metric. A card sitting on a canvas measures ~1.05–1.09:1
and my script prints "FAIL" — that label is meaningless for two adjacent
surfaces, and the correct metric is ΔL*. Under v6, `#FFFFFF` on
`#F7F5F4` separates by **ΔL* 3.34** under v7 — comfortably visible. (v6
gave 4.51 and v5 3.25; every palette so far has cleared the bar, but the
figure must be re-derived per palette, not assumed.)

Two rejections from earlier palettes, kept because the lesson holds at
any values: a `#FAFAF8` canvas was rejected at ΔL* 1.78, and a `#FAFAFA`
card on a `#F7F6F3` canvas gave only **ΔL* 1.39 — near-invisible**. The
lesson is that a card and canvas chosen independently can look correct
in a table and vanish on screen, which is why the canvas
above is warmer and darker than the earlier `#F7F6F3` proposal.

- **Cards separate from the canvas by value plus a soft diffuse shadow,
  not a hairline.** Wherever a border is currently doing the separating,
  the border goes and the value difference does the work — this is the
  Airbnb model the owner keeps pointing at, and it is what "smooth"
  means structurally.
- **Soft diffuse elevation is not the retired `.token` offset shadow.**
  That rule stands (`FRONTEND_DESIGN_STANDARDS.md`, and §16.2 removed the
  last surviving offset). A hard, opaque, offset shadow is still banned;
  a soft low-opacity diffuse one is the opposite treatment and is what
  this direction requires. Worth stating plainly so this doesn't read as
  reintroducing what was retired.
- If the lift ever reads too faint in practice, the tested next step is
  a deeper canvas — change the canvas, not the card, and never add a
  border back as the first fix. v6's ΔL* 4.51 has margin, so this is
  unlikely to be needed.

### 19.4 — Radii: §17's consolidation resolves upward, deliberately

**This reverses the value §17 proposed, on purpose.** §17 found 13 ad-hoc
radii clustered at `0.1`–`0.2rem` (~1.6–3.2px, i.e. effectively sharp)
and specced consolidating them at roughly their existing value. Under
"smooth" that would be technically tidy and miss the brief — 13
consistently sharp corners is still sharp. Consolidating them **upward**
is the actual ask.

- New token **`--radius-control: 10px`**, replacing §17's proposed
  `--radius-tight`, applied to all 13 sites (buttons, inputs, fields).
- The existing scale is already soft and **stays**: `--radius-ring` 14px,
  `--radius-thumb` 18px, `--radius-panel` 22px, `--radius-pill` 26px,
  `--radius-hero` asymmetric. Nothing here needs sharpening or softening.
- §17's two literal-vs-token fixes still stand: `.wall-tile__note`'s
  hardcoded `20px` → `var(--radius-pill)`, and `.home-title strong::after`'s
  `99px` stays as-is (a decorative underline swash, not a control).

Motion needs no change — `--ease-settle`, no overshoot, reduced-motion
respected (§7, §14) already is "smooth."

### 19.5 — Sequencing

§18's type scale is **landed, merged and verified live** (2026-09-06), so
that half is done and the two passes are no longer at risk of colliding.
**Frontend implements this palette; Design does not touch `globals.css`**
— then Design reviews the rendered result against the measured values
above, which catches a token that resolved wrong far faster than reading
the diff would.

**All earlier open questions are closed** — the owner supplied exact
hexes (§19.1), which ended the `#70887A` mislabel question and the
brown-lightness judgement in one go. No inference remains in the palette.
The values in §19.1's table are final and implementable.

When it does land: §1's v3 tables are superseded, and
`FRONTEND_DESIGN_STANDARDS.md`'s Colour section needs a fifth reversal
entry recording that **navy-primary, gold-as-the-accent, and the
night-first identity are all retired here**, and that dark mode is parked
per §19.2 rather than removed — with the same "do not restore by
accident" framing the other four reversals carry.

### 19.6 — `--color-accent-premium`: retire it

Frontend correctly refused to guess at this one. The answer is **retire
it**, and the reasoning is not a palette judgement at all.

**It has zero consumers.** `--color-accent-premium` is declared twice —
`#8a6d2f` in the day `@theme` block (`app/globals.css:61`) and `#5cc8d7`
in the night block (`:196`) — with a careful comment describing a
badges-and-streaks job. Nothing reads it: no `var(--color-accent-premium)`
anywhere in `app/`, `components/` or `lib/`, and no Tailwind utility
alias. **The job it describes does not exist in the product either** —
the only "streak" in the tree is plain `<strong>` text in
`DemoAccountViews.tsx` (fixture-only, `/home-preview`), which does not
use this token; the real signed-in `AccountViews.tsx` has no streak
feature at all.

So this token was **already dead before palette v5 touched anything**. It
is not a live token stranded by the new family — it was defined for a
feature that was never built. That reframes the question: this is not
"what colour should the premium marker be," it is "should a token with no
consumers and no feature survive a palette rewrite," and the answer to
that is no.

**Why "retire" does not collide with the earlier gold direction.** Two
reasons, and the second is the decisive one:
1. The white/gold/black/silver brief was superseded twice — first by warm
   desert, then by the owner's exact five (§19.1). Gold is not in the
   current direction.
2. **Removing it changes nothing on screen**, because nothing renders it.
   Retiring an unused token cannot remove gold from the product, since
   the token was never putting gold anywhere. If gold is wanted later it
   returns as a deliberate decision with a real consumer, which is
   strictly better than keeping a dead declaration as a placeholder for a
   direction that has already been replaced.

Note also that `components/CLAUDE.md` documents Tailwind v4 tree-shaking
unreferenced `@theme` vars, so the day declaration is likely already
absent from the compiled CSS — making this removal close to a no-op in
the build as well as on screen.

**Do**: delete both declarations and their comment. **Do not** fold the
value into one of the five or reassign it silently — if the streak or
premium-badge feature is ever built, it picks a colour from §19.1's table
at that point, as a decision made with the feature in front of you.

### 19.7 — The boundary floor: components must be visible against their ground

Owner, verbatim: *"sometimes some elements' colors will blend in with the
background, and you can't see them that well. That is one major issue I'm
finding throughout the design of this website, so let's terminate that.
The components and the background of the website should have contrasting
colors so you can see them clearly."*

The cause is a single token with no rule behind it. `--color-line`
(`app/globals.css:46`) is `rgba(27,42,74,0.30)`, used ~92 times, and
composites to `#B5B9C2` on the page ground — **1.82:1**, confirmed by
independent re-derivation of the composite. WCAG 2.1 SC 1.4.11 asks 3:1
for a UI component's visual boundary, so effectively every bordered
control in the app sits at ~60% of the floor, from one value. It drifted
because nothing was written down; a number nobody can check against is a
number that rots.

**The rule, stated as a floor rather than a value:**

1. **A UI component's boundary must reach ≥3:1 against the ground it sits
   on.** Buttons, inputs, selects, textareas, toggles, checkboxes,
   avatars, cards that are themselves interactive — anything a person
   operates.
2. **Check both grounds separately.** A line clearing 3:1 on the canvas
   can fail on the lighter card, and this app puts bordered controls on
   both grounds named in §19.1. One measurement is not a pass.
3. **Text keeps its own, higher floor** — 4.5:1 for body copy, unchanged
   and unrelated. A boundary clearing 3:1 says nothing about whether text
   in that colour is readable.

**The graphite inset focus ring specced under this section is superseded
for dark by §23.7.** `var(--color-ink)` is invisible on `#051822`, and no
single value clears 3:1 on all four grounds a control can sit on — the ring
is now two bands. The *floors* in this section are unchanged and still
binding; only the ring's value is.

**This rule has already caught two live values, which is the argument
for stating floors instead of picking numbers.** Recorded because the
pattern repeats, not for the specific hexes:

1. `#998F8A`, specced here as `--color-line`, measured 3.03:1 on card and
   **2.79:1 on canvas** — scraping on one ground, failing on the other.
   Caught and replaced before Frontend consumed it.
2. The value Frontend *did* implement against still carried a
   white-referenced figure, and they independently darkened it for the
   same reason. Two people caught the same class of error in one day.

**The cause in both cases was quoting a figure against pure white, a
ground this app never renders.** §19.1's table now names canvas and card
for every value; if a future revision reintroduces a white-referenced
number, it will reintroduce this bug. Related: do not carry a legacy
alpha (the old `rgba(...,0.30)`) into a new family — deriving a fresh
colour and keeping the old transparency is exactly how a 1.8:1 boundary
survives a palette rewrite.

**When a component has no border, name what carries it.** "Borderless"
must be a choice with a mechanism, not an absence:

- **A fill** — the fill itself clears 3:1 against the ground. The brown
  fills do this easily (v7's `#051822` is 16.65:1 on canvas).
- **Text alone** — legitimate only for genuinely chromeless controls (a
  text link, a bare-label ghost button), where the label carries 4.5:1
  and there is *no implied edge at all*. A faint border that can't be
  seen is the failure case; no border is not.
- **Shadow does not count.** A soft diffuse elevation (§19.3) is
  low-contrast by construction — that is what makes it soft. It may
  accompany a boundary, never substitute for one.

**Why the card lift is held to a different standard, one line away from
this.** §19.3 sets the card/canvas step at ΔL* 3.25 and explicitly does
*not* hold it to 3:1. That is not an inconsistency, and the next person to
read both will assume it is unless this says otherwise:

- A **card is a passive surface** grouping content. Nobody operates its
  edge; the question is only "is this a distinct plane," which is a
  perceptual-step question, so ΔL* is the right metric.
- A **control is operable**. The question is "can I see that this is a
  thing I can use, and where it ends," which is what SC 1.4.11 governs
  and what 3:1 measures.
- Forcing 3:1 on a card edge would demand either a heavy visible border
  or a much darker canvas — killing the smooth borderless direction or
  the "emphasise white" brief respectively. The standard doesn't ask for
  it, and the brief actively forbids both fixes.

**The tan's two floors now derive instead of being a special case.**
v7's tan `#AA7452` measures 3.94:1 on card and 3.63:1 on canvas: it
**clears the 3:1 boundary floor on both** while **failing the 4.5:1 text
floor on both**. So it is legitimately a rule, an edge or a divider and
never a label — which is exactly the role §19.1 gives it, now as a
consequence of two stated floors rather than an assertion about one
colour. Grey `#969A9E` fails *both* floors on light grounds and is
decorative only.

---

## 20 — Italic as a restrained accent (owner, 2026-09-06)

Owner, verbatim: **"use more italic fonts the slanted ones those give a
classy aesthtic look for our app but dont over use it you can use it at
the welcome pages."** The ceiling is part of the instruction, not a
caution added on top — so it is specced as tightly as the permission.

### 20.1 — Blocker: there is no italic font file today

**This must be fixed before a single `font-style: italic` ships.**
`public/fonts/` contains exactly one Newsreader file —
`newsreader-variable-latin.woff2` — declared `style: "normal"` in
`app/layout.tsx:29`. There is no italic face. Setting `font-style:
italic` today therefore produces a **browser-synthesised oblique**: the
roman letterforms mechanically slanted.

That actively defeats the instruction. Newsreader's real italic is a
separately drawn face with different letterforms (a true single-storey
`a`, a cursive `e` and `g`) — that is where the "classy" comes from. A
synthesised slant is the cheap-looking version of exactly this effect,
and it will read as a mistake rather than as an intention.

**Fix**: add the Newsreader italic variable file to `public/fonts/` and
register it as a second entry in the existing `localFont` `src` array in
`app/layout.tsx` with `style: "italic"` and the same `weight: "200 800"`
range. No `@font-face` hand-rolling, no second `localFont` call — one
family, two styles, so `font-style: italic` resolves to the real face.
Hanken Grotesk needs **no** italic file: body text never goes italic
under this spec, so the need never arises.

### 20.2 — Where italic is allowed

Display serif only (`--font-display`), and only on **welcome / entry
surfaces** — the places a visitor arrives, not the places they work:

- The front-door hero headline (`.home-title`).
- `/login`'s intro headline.
- `/onboarding`'s intro headline.

**At most one italic element per screen.** Not one per section — one per
screen. Either a short whole headline, or a single phrase inside a longer
one, never both, and never a multi-line headline set entirely in italic
(the effect stops reading as emphasis the moment it becomes the texture).

### 20.3 — Where italic is forbidden

Everything else, but naming the tempting ones specifically, because a
general rule will not survive contact:

- **All body copy, at any size, anywhere.**
- Buttons, labels, form fields, placeholders, nav and tab items.
- **Any data**: names, counts, times, prices, dates, distances, vote
  tallies. Data in italic reads as uncertain.
- Empty, loading, error and confirmation states.
- The whole signed-in surface — the four account tabs, the vote flow,
  the place page, `DecidedPlan`. None of these are welcome surfaces;
  someone is working, not arriving.
- Never as a substitute for emphasis in running text. If a word needs
  weight, it takes weight (§18's tiers), not a slant.

### 20.4 — Why the ceiling is this tight

One italic line on an entry screen reads as considered. The same
treatment on a second element reads as a theme, and on a third it reads
as a font choice nobody made deliberately. The owner asked for the first
and explicitly warned against the drift. If a future change wants italic
somewhere not on the §20.2 list, that is a new decision to take
deliberately — not an extension of this permission.

## 21 — Selective colour: which components wear a colour (owner, 2026-09-06)

> **Rewritten 2026-09-06 after the owner rejected the first model.** The
> first version assigned tan and blue **per card, alternating by index**
> across the Discover grid. Frontend implemented it exactly as written —
> 26 filled, ratio 0.32, none adjacent — and the owner's reaction was:
> *"i think youre forcing the colors the colors shoukdnt be mixed arounds
> you have to choose with which compenents or which layouts each color
> will look good."*
>
> They were right, and the failure was in the spec, not the build.
> **Position-based assignment is random by construction**, and at 26 cards
> that randomness is visible as scatter. A viewer cannot tell why *this*
> card is tan, because there is no why.

### 21.1 — The model: a colour belongs to a component, not to an instance

> **Each colour has a structural job. A kind of surface is always tan, or
> always blue, or always neutral — everywhere, every time.**

No per-instance variation at all. That is what kills the scatter: colour
stops being a property a card happens to get and becomes a property of
**what a surface is**.

It also cannot become the retired category rainbow, which was the reason
the first version avoided data-driven assignment. That reasoning still
holds and is unchanged — this model keys on **what a component IS**, never
on the data it carries, so a spot changing category or price still never
changes any colour.

### 21.2 — Which principle won, stated explicitly

The first version's rule was *"a fill stands in for a missing image."*
**It does not survive as an assignment rule, and it is withdrawn.**

The reason is the same one that killed index assignment: photo presence
is a **per-instance data condition**. Filling the cards that lack a photo
and leaving the rest neutral produces exactly the scatter the owner
rejected — arbitrary-looking, because the viewer cannot see the reason.
Keying on absence is no less random *to look at* than keying on index.

**What survives from it, as a constraint rather than a trigger:**

> **A fill never sits on or behind a photographed surface.**

That half was always right — photography and coloured fills do the same
job, so they never compete. It is now a *never*, not a *where*.

**Cost of this change, stated honestly:** the old §21.7 gave automatic
recession — colour thinned itself as photos arrived, with no code change.
That property is **gone**. Under component assignment nothing self-limits,
so the ceiling in §21.4 is now the only thing holding the line, and it has
to be enforced by review rather than by arithmetic.

### 21.3 — Two instruments, and the quiet one is the default

**Updated for palette v7 (§19.1).** v7 changes what this section can use,
and improves it: **brown `#7C5841` carries small text natively** (5.80 on
canvas, 6.31 on card). v6 had no text-capable accent, which is why the
first version reached for coloured *blocks* — the only instrument it had.

There are now two, and they are not equal:

| Instrument | Value | Weight | Where |
|---|---|---|---|
| **Accent text** *(default)* | brown `#7C5841` | Quiet | Section kickers and labels — a **component role**, applied consistently wherever that component appears. |
| **Framing fill** *(exception)* | light `#D4C9C7`, navy text on it 11.19 | Louder | One singular framing surface per screen (§21.4, §21.5). |

**Reach for the text instrument first.** A brown kicker is colour applied
by component role, everywhere that component appears, with no blocks and
nothing to scatter — it satisfies the owner's instruction more directly
than any fill does, and it is the thing that was unavailable when they
said colour was being forced.

**Heavier fills exist and stay in reserve**: tan `#AA7452` (navy text,
4.59) and slate `#2D383E` (white text, 12.02). Use them only where a
surface genuinely wants weight — realistically the payoff panel, and
little else. Grey `#969A9E` is decorative only and never carries text.

### 21.4 — Colour goes on framing surfaces, never on repeating content

This is the operative distinction, and it is what makes §21.1 concrete:

- **Repeating content is never filled.** Venue cards, vote option cards,
  visit tiles, photo-wall tiles, friend rows, search results. These are
  *content*. Photography is their colour, and filling them is precisely
  what produced the scatter. **This is the single biggest change from the
  first version** — the Discover grid stops being where colour lives.
- **Singular framing surfaces may be filled.** A section intro band, an
  empty-state panel, a callout strip, the payoff panel. Surfaces that
  appear **once on a screen** and frame content rather than being content.

**Never filled, regardless:**
- The hero / featured card, even when photo-less. It is the largest
  surface on screen, so a filled hero reads as a *themed page* rather than
  punctuation. Unchanged from the first version, and the clause most
  likely to be argued with, which is why it is stated.
- Nav, header, footer, page canvas, forms, modals.
- Buttons and actions — ink or the pop colour (§19.1), never a fill.
- Error, loading and confirmation states, which carry semantic colour.

### 21.5 — The ceiling

**At most one filled surface per screen.** Not one per section — one per
screen.

This is the same shape as §20's one-italic-per-screen, deliberately: the
owner has now asked three times for restraint on an expressive element,
and that shape is the one that has held. Under the old model the ceiling
was a ratio because the fills were many and small; under this one they
are few and large, so the ceiling is a count.

If a screen has both a populated section band and an empty state, the
empty state takes the colour and the band goes neutral — the rarer, more
meaningful surface wins.

### 21.6 — Mechanics, restated for v7

The *shape* of the ink rule survives — a fill's ink is never softened —
but v7 changes the values, and for the better. **The lesson that cost
Frontend three attempts under v6 is now structural rather than a trap:**

- **The ink flips at tan, with no exceptions** (§19.1). Navy, slate and
  brown fills take **white** text; tan, grey and light fills take **navy
  `#051822`**. Worst case across the six is 4.59:1, all passing.
- **Every colour in v7 is usable as a fill.** v6's brown had no workable
  ink at all — nothing could sit on it. That trap is gone, so the rule is
  now "pick the right ink" rather than "avoid a colour entirely."
- **Never soften the ink.** The v6 failure was a softened mid-tone
  dropping to ~4.0:1. The flip rule above is the whole discipline: full
  white or full navy, nothing in between.
- Grey `#969A9E` is never text on any ground — 2.83 on white, 1.75 on
  `#D4C9C7`. Decorative and boundary use only.

### 21.7 — What this looks like in practice

Concretely, so it is reviewable rather than interpretable. Note how
little of this is a fill:

- **Everywhere**: section kickers and labels take **brown text**. That is
  the accent, and on most screens it is the *only* colour.
- **Discover**: grid cards neutral. The intro band may take the **quiet
  fill `#D4C9C7`**, or the empty state does if the catalogue is empty.
  One of the two, never both.
- **The photo wall**: tiles neutral. The empty wall takes the quiet fill.
- **A live plan**: the plan card is the hero, so it stays neutral (§21.4).
  Brown kicker only.
- **The payoff** (`DecidedPlan`): the decided panel takes **tan
  `#AA7452`** with navy text. This is the one place a heavier fill is
  earned — the moment the whole flow exists for, once per plan,
  unambiguously the group's own.
- **Been / Profile**: brown kickers. The recap strip may take the quiet
  fill. Collections grid neutral.

A screen not on this list gets no fill until someone adds it here
deliberately. **If in doubt, use the brown text and no fill** — that is
the reading of "only wherever they naturally fit" that is hardest to get
wrong.

## 22 — Free space is distributed, not left where it falls (owner-approved, 2026-09-06)

Owner, after seeing the hero card fan re-centred: **"yes now i like the
padding now for the cards mantain this througout the rest of the
application."**

**They approved the principle, not the number.** The fix produced 79px
above and below, and "maintain this throughout" will be read as *79px*
and hard-coded somewhere unless this says otherwise. It is not a value.

### 22.1 — The rule

> **A container decides where its free space goes, using an alignment
> property. It never leaves the slack wherever it happens to fall.**

The bug was not a wrong padding number. `.home-stage` was 152px taller
than the card fan inside it, and the leftover landed **0px above, 152px
below** — because nothing had decided. The container had free space and
no instruction about it.

The fix is `align-items: center` on the container (and removing the
deck's `mb-8`, which was compensating), giving 79/79. Verified in both
card poses at all four stage heights the CSS defines.

**Why margins are the wrong fix even when they produce identical
pixels.** A margin is a fixed compensation for one container height. It
looks correct today and silently goes wrong the moment the container
resizes — a new breakpoint, a longer card, a different pose. An alignment
property re-derives the distribution at every height, so it cannot drift.
Same pixels now, different behaviour later.

### 22.2 — What to sweep for

This is the rule that makes the visual QA pass actionable, so it is
stated as a diagnostic rather than a principle:

> **Find every container that is taller (or wider) than its content, and
> check whether the leftover space lands entirely on one side.**

Where it does, the fix is an alignment property on the container — not a
margin, not a padding, and not a magic number on the child.

**Do not mistake this for a spacing scale.** A perfectly consistent scale
of spacing values would not have caught the hero bug: 0/152 can be built
entirely from valid scale tokens. The owner's complaint was **asymmetry**,
which is a distribution problem. A scale answers "how much space"; this
answers "where the space goes." Both are needed and they are not the same
rule.

### 22.3 — The related open case: a floor and a container that disagree

Same shape, already known and queued for the mobile pass. The deck's
cards carry a fixed `min-h-[440px]` at every width, while `.home-stage`
drops to 29rem and 27rem on small screens. At those heights the floor
exceeds the container and the deck bleeds past it.

Again: nobody decided where the difference goes. A fixed floor and a
responsive container height that disagree is the same failure as
top-aligned slack, just with the sign reversed — overflow instead of
gap.

**Fix it principled, not numerically.** Either the floor becomes
responsive alongside the container, or the container grows to honour the
floor. Adding a smaller magic number at a breakpoint reproduces the
original bug at a different width, which is exactly what §22.1 exists to
prevent.

---

## 23 — Dark is the identity, and the flattening is solved (owner, 2026-09-07)

**Mock:** `design-system/mocks/energy-dark-v1.html`. Every figure below was
computed, and the mock was audited in-browser with alpha composited through
ancestors: **0 text failures, all component boundaries ≥3:1 on both sides.**

*Numbering note: §23.5 and §23.6 became §23.11 and §23.12 when §23.7–23.10
landed, so this section reads in order. Nothing was deleted.*

### 23.0 — This reverses two written owner directions. Say so, don't quietly drift.

Both are still written down elsewhere. Someone will read the reversal as
drift and try to restore them — that has already happened once in this
project. It hasn't drifted; it was decided.

| Reversed | Was | Superseded |
|---|---|---|
| **"Emphasise white heavily"** | White-dominant, light-only (§19) | **2026-09-07** — *"the main color in the bg is just white lets not keep it like that seems monotnous"* |
| **"No dark mode, hold it back"** | Dark parked in §19.2 | **2026-09-07** — *"i think i like the dark theme more"*, against their own stated condition *"if that looks really good then we can keep that as the standard look"* |

**Why this is a correction and not drift:** the owner chose these six values
**before** dark was ever discussed, and two of them are proper darks
(`#051822` L\* 7.2, `#2D383E` L\* 22.8). Dark was latent in the palette they
picked. It is not a theme bolted onto a light system — which is exactly why
it can be the identity without introducing a seventh colour.

### 23.1 — The blocking problem, and why it was self-inflicted

> **⚠️ ITS TWO GROUND VALUES ARE SUPERSEDED BY §24 (2026-09-07).** Canvas is
> now `#051822` and cards `#0B2836`. **Its rule is also corrected there:**
> this section concluded "cards are wells, not planes", which over-drew a
> *directional* rule from what was really a *magnitude* finding. Read it for
> why the near-white ground read flat (ΔL\* 3.34 — still correct and still
> load-bearing) and why a 15.54 lift costs a tier; take the live arrangement
> from §24.

As a *theme*, mono-ink card interiors were a compromise worth stating. As the
*identity* they are unshippable: single-value card interiors are precisely
the flattening palette v6 was rejected for.

The cause was not the palette. `dark-theme-v7.html` made cards **lighter**
than the canvas (`#2D383E` on `#051822`), importing light mode's
raised-plane metaphor. That one choice spends 15.5 points of L\* headroom —
the exact band grey and tan occupy — so on the card ground only `#D4C9C7`
survives.

**Invert the elevation and the problem disappears with no new colour.**

| | Rejected (card above ground) | **Live (card below ground)** |
|---|---|---|
| Canvas | `#051822` | **`#2D383E`** (L\* 22.8) |
| Card | `#2D383E` | **`#051822`** (L\* 7.2) |
| Legible text tiers **inside a card** | **1** | **4** |

Cards are **wells cut into the ground**, not planes floating above it. This
is correct for dark UI generally — depth reads as recession, not elevation —
and here it is also the only arrangement that clears the floors.

**It also answers the background complaint.** Today's canvas and card differ
by **ΔL\* 3.34** (`#F7F5F4` vs `#FFFFFF`) — near-white on white, which is
*why* the ground reads as one inert field. The live arrangement separates
them by **ΔL\* 15.54**, over four times the differentiation. A flat `#051822`
would have been just as inert; the canvas earns its size by being a
*different material* from the cards, not by being dark.

### 23.2 — The dark token set

> **⚠️ `--canvas` and `--card` are superseded by §24.** Every other token
> here is live; §24.4 re-quotes the figures against the new grounds. The
> `--muted` surface-dependence warning below is **no longer true of the two
> dark grounds** — see §24.5, which restates it rather than dropping it.

Six owner values, **one derivation**, no seventh identity colour.

| Token | Value | On canvas `#2D383E` | On card `#051822` |
|---|---|---|---|
| `--canvas` | `#2D383E` | — | — |
| `--card` | `#051822` | — | — |
| `--ink-strong` | `#FFFFFF` | 12.02 | 18.10 |
| `--ink` | `#D4C9C7` | 7.43 | 11.19 |
| `--muted` | `#969A9E` | **4.24 — large text only** | **6.39 — body OK** |
| `--accent` | `#BF977D` *(derived)* | **4.54** | **6.84** |
| `--edge` | `#969A9E` @ **0.80α** → `#81868b` | 3.27 | 4.93 |

**`--muted` is surface-dependent, and this is the trap.** Grey is body-legal
**inside a card** and fails **on the canvas**. It caught me in this mock's
own page chrome at 4.24 — the rule is real, and it is not obvious by eye.
Small text on the canvas takes `--ink`.

**`--edge` at 0.80α.** ⚠️ **The justification here was measured against
§23's grounds and §24 moved them — corrected in §24.4.** On the old pair
0.65α failed at 2.68; on §24's closer grounds it clears at 3.10, so 0.80 is
specified for **margin**, not because the next step down fails. The floor is
real but lower: **0.64α is the last value that clears (3.05); 0.62α falls to
2.94 and fails.** A vote option is a
real `<button>` whose boundary is informational, so the margin is worth
keeping — but do not repeat the old reason, which is no longer true.

**Grey finally earns a token.** §19.1 recorded that `#969A9E` gets none
because nothing renders it. In dark it is both the card-interior meta ink
and the boundary — so the note in §19.1 is now superseded *for dark only*.
It still earns no token in light.

### 23.3 — §21's accent, re-derived rather than ported

§21's default instrument is **accent text applied by component role**. Brown
`#7C5841` does not survive dark: **2.87** on the canvas, **1.91** on cards.
Porting it is not an option.

Tan `#AA7452` is the obvious substitute and it *almost* works — 4.59 on the
card but **3.05 on the canvas**, which would force §21 to grow a per-surface
exception it does not currently have.

**`--accent: #BF977D`** — tan lightened 25% toward white — clears body text
on **both** dark grounds (4.54 / 6.84), so §21 keeps its single rule.

This is a **derivation, not a seventh colour**, on the same precedent
already accepted for `muted` / `line` / `error` / `confirm`. It sits in tan's
own hue family and desaturates slightly, as any lightening toward white
does. **Tan and light are unchanged as fills.** The "we ship no colour the
owner did not pick" rule is about *identity* colours; if this is judged to
cross that line, the fallback is tan-on-cards-only plus a per-surface
exception in §21 — worse, but available.

**§21.4 and §21.5 are untouched.** Repeating content is still never filled;
the ceiling is still one filled surface per screen.

### 23.4 — Where the energy comes from (the "boring" brief, same decision)

The owner has now twice called the app boring, and D1's premise — *restraint
is fine because photography supplies the colour* — **did not hold**:
photography never arrived at scale (**6 of 82**), and restraint against
nothing reads as empty rather than elegant.

**The finding is that energy is misallocated, not missing.** Measured in
`app/globals.css`: **151 rules set type below 0.9rem**, against **3 at 2rem
or above**. The display type the app owns is spent on marketing, auth and
demo surfaces, which run headlines to `clamp(3.5rem, 7vw, 6.8rem)`.
Meanwhile:

> **`"It's {winner}."` — the one sentence this product exists to produce —
> is set at `text-xl`, 1.25rem** (`components/DecidedPlan.tsx:140`).
> **`.legal-page h1` reaches 3.5rem.** The privacy policy shouts louder than
> the payoff.

No palette fixes that. **Energy is scale, motion and density — never more
colour.** Every item below is a font-size or a padding.

**23.4a — The photo-less card stops reserving space for a photo.**
Applies to **76 of 82** cards. The name grows **0.98rem → 1.72rem** Cormorant
and occupies the region the image placeholder held; `vibe`, `cuisine` and
`open_till` are rendered beneath it. **All three fields already exist on
every `Spot` row** (`lib/types.ts:15-34`) and are simply not drawn today.
A card that *does* have a photo keeps the photo and reverts to a modest
name — the two states must look different, because the point is to stop
pretending an image is coming. **No fill is involved; §21.4 holds.**

**23.4b — The leader earns the space.** One vote row per screen, and only
while genuinely ahead: padding `12px 14px → 20px 16px`, name to 1.55rem,
tally as Cormorant display at 2.9rem. Same one-per-screen shape as §20's
italic and §21's fill. **The word "leading" stays** — the state is never
carried by size alone (`a11y-responsive`: colour and scale are not signals).

**23.4c — Ungate the reveal from photography.** `WinnerPhotoReveal` is
gated on `winner.photo_url` (`components/DecidedPlan.tsx:125`), so the
particle animation we built and shipped **has never run for 76 of 82 spots**.
Reconstruct **the winner's name** instead: same component, same canvas,
`drawImage` → `fillText`.

- It then runs on **every** decision instead of 7% of them.
- It **cannot taint the canvas**, because the pixels are drawn locally
  rather than fetched from a third-party host — this deletes the
  `getImageData()` fallback path the current version needs.
- **When the winner has a photo, the photo version still wins.** This is the
  other 92%.
- Ink `#D4C9C7` on `#051822` (11.19). `prefers-reduced-motion` renders the
  type immediately, no particles — unchanged from the current contract.
- **Implementation note that will bite:** Cormorant loads async. Sampling
  before `document.fonts.ready` reconstructs the *fallback serif* instead.
  Await it.

### 23.7 — The focus ring, solved: two bands, inset

**This was a shipping blocker, not polish.** §19.7's graphite inset ring
(`outline: 2px solid var(--color-ink)`) is invisible on a near-black card,
and every control on a card is affected — that is keyboard accessibility
failing on the app's primary surface.

**No single colour can do this job, and that is a measured result rather
than a judgement.** A focusable control in dark sits on **four** grounds:
card `#051822`, canvas `#2D383E`, and the two §21.3 fills, tan `#AA7452`
and light `#D4C9C7`. That spans L\* 7.2 → 81.8. Every candidate was tested
against all four:

| Candidate | Worst ground | Verdict |
|---|---|---|
| white `#FFFFFF` | 1.62 on the light fill | fails |
| light `#D4C9C7` | 1.00 on itself | fails |
| grey `#969A9E` | 1.39 | fails |
| tan / brown / slate / navy / `#BF977D` | ≤1.60 | all fail |

**The ring is therefore two bands**, so that whichever ground it lands on,
at least one band clears the floor:

```css
:root { --ring-outer: #D4C9C7; --ring-inner: #051822; }

.control:focus-visible {
  outline: 2px solid transparent;   /* forced-colors fallback — see below */
  outline-offset: -2px;
  box-shadow: inset 0 0 0 2px var(--ring-outer),
              inset 0 0 0 4px var(--ring-inner);
}
```

| Ground | Outer band | Inner band | Visible band |
|---|---|---|---|
| card `#051822` | **11.19** | 1.00 | **11.19** |
| canvas `#2D383E` | **7.43** | 1.51 | **7.43** |
| tan fill `#AA7452` | 2.44 | **4.59** | **4.59** |
| light fill `#D4C9C7` | 1.00 | **11.19** | **11.19** |

**Worst case 4.59**, on the tan fill. The two bands also separate from
*each other* at **11.19**, so the ring reads as a ring rather than a smudge.

**Both values are the owner's own.** White scores better on the two dark
grounds (18.10 / 12.02) but that contrast is already surplus — it would buy
nothing visible and spend a value outside the six. If a future surface makes
`#D4C9C7` unworkable as the outer band, white is the fallback and the
worst case is unchanged at 4.59.

**Four implementation details that are each load-bearing:**

1. **Inset, not outset.** Same reason §19.7 gave: drawn inside the control
   so an ancestor's `overflow` cannot clip it. `box-shadow: inset` also
   follows `border-radius` for free, which a manually-drawn ring does not.
2. **`box-shadow` is free in dark, and that is not a coincidence.** Dark
   uses no elevation shadows — a shadow must be darker than its ground, and
   `#051822` is already at the floor, so a soft elevation is *structurally
   invisible* here. Separation in dark comes from value and the `--edge`
   hairline (§23.1, §23.2). **If any dark surface later gains an outer
   `box-shadow`, this rule must append rather than replace it**, or focusing
   a card silently deletes its elevation.
3. **Keep the transparent `outline`.** In forced-colors / Windows High
   Contrast mode `box-shadow` is dropped entirely; a transparent outline is
   re-coloured by the OS and the ring survives. Without this line, the ring
   vanishes for exactly the users most likely to need it.
4. **`:focus-visible`, not `:focus`.** Verified in-browser: programmatic
   `.focus()` and mouse clicks correctly do *not* raise the ring; a real Tab
   does. Testing this with a scripted `.focus()` reports a false negative —
   it did here first — so **verify it with an actual key press**.

**Mock:** the four-ground panel in `energy-dark-v1.html`. Tab into it.

### 23.8 — Light mode: parked, not deleted (owner, 2026-09-07)

Owner: **"Keep light mode in the dark for now. Hold it back. Let's focus
more on the dark mode. I think I'm liking the dark side a bit more."**

**This is §19.2 run in the opposite direction, and it is deliberately the
same procedure.** §19.2 parked dark rather than deleting it; that discipline
is the entire reason making dark the identity cost a spec instead of a
rebuild. It has now paid off once. Apply it symmetrically and it can pay off
again — including for light, if the owner reverses back.

- **Keep, untouched:** every light value in §19.1, `lib/dubai-phase.ts`,
  `components/ThemeSync.tsx`, and the light rules in `app/globals.css`.
  §19's light figures are measured and correct; nothing about them is wrong.
- **Stop exposing the path:** remove the light option from any ground
  toggle, and pin the resolved ground to **dark** without editing the clock
  logic itself — the Dubai clock stays correct, only its *application* is
  parked.
- **⚠️ THE GROUND IS DECIDED IN TWO PLACES.** §19.2 learned this the hard
  way — an earlier draft of it named one site, Frontend caught the second in
  implementation. **Pinning only the server stamp leaves the clock flipping
  the document back within 60 seconds.** Both:
  1. **Server:** `app/layout.tsx`'s `autoGround()`, which stamps
     `data-theme` for first paint.
  2. **Client:** `components/ThemeSync.tsx`'s `resolveGround()` inside
     `apply()` — on mount, **again every 60s via `setInterval`**, and on a
     `storage` event. The interval is the one that bites: pin the server
     only and the app looks right, then flips up to a minute later.
- **Comment the park at each site**, in these words or close to them:

  ```
  // PARKED 2026-09-07 (owner: "Keep light mode in the dark for now. Hold
  // it back."). Light's values are intact and correct; only the path that
  // selects them is disabled. NOTE: the ground is pinned in TWO places —
  // app/layout.tsx (server stamp) and ThemeSync (client re-resolve, incl.
  // a 60s interval). Restoring one without the other half-restores light.
  // To restore: re-enable both plus the ground toggle. See SPECS.md §23.8.
  ```

- **Do not delete the light values**, and do not fold them into the dark
  set. They are a measured, working system; if light returns it should
  return as itself, not be re-derived from dark.

**One asymmetry worth stating.** §19.2 parked dark when dark was
*subordinate*. This parks light when light is *what the whole app currently
renders*. So the pin is the more dangerous edit of the two: get it wrong and
the app flickers between two complete identities on a 60-second cycle, in
front of users. Verify by watching a real page for **at least 90 seconds**
after the change — a single screenshot cannot catch an interval bug, and
this repo has already produced one confident wrong conclusion from a
screenshot.

### 23.9 — The primary fill, and the reveal panel's ground

Two surfaces Frontend needed before implementing, both the same class of
question: **a new surface needs its ink chosen *and* §23.7's ring
re-measured against it.** Neither was decided by the floors alone.

#### 23.9a — `--primary-fill` / `--primary-ink`

**Five of the six candidates pass every floor**, so measurement narrowed
this and did not decide it. Stating that plainly, because a judgement
dressed as arithmetic is harder to revisit later:

| Candidate | Boundary card / canvas | Best ink | Ring on it |
|---|---|---|---|
| **light `#D4C9C7`** | **11.19 / 7.43** | navy **11.19** | **11.19** |
| white `#FFFFFF` | 18.10 / 12.02 | navy 18.10 | 18.10 |
| tan `#AA7452` | 4.59 / 3.05 | navy 4.59 | 4.59 |
| accent `#BF977D` | 6.84 / 4.54 | navy 6.84 | 6.84 |
| grey `#969A9E` | 6.39 / 4.24 | navy 6.39 | 6.39 |
| brown `#7C5841` | **2.87 / 1.91** | — | — **fails** |

**Live: `--primary-fill: #D4C9C7`, `--primary-ink: #051822`.**

- **Boundary** 11.19 on card, 7.43 on canvas — clears §19.7's 3:1 on both.
- **Ink** navy on the fill, **11.19** — clears 4.5.
- **Ring (§23.7):** outer band `#D4C9C7` is **1.00** on this fill and
  correctly disappears; the inner band `#051822` carries it at **11.19**.
  This is the two-band design doing exactly the job it was built for, on
  the fifth surface — the one that did not exist when it was specced.

**Why not white,** which scores higher on every line: the extra contrast is
surplus — 11.19 is already more than double the floor — and it would be
bought by shipping a value outside the owner's six. Same reasoning as
§23.7's outer band. White remains the documented fallback if a future
surface makes `#D4C9C7` unworkable.

**Why not tan, accent or grey,** which all pass: **each already has a job.**
Tan is §21.3's reserved framing fill, accent is §21's accent text, grey is
§23.2's boundary and card-meta ink. Making any of them a button background
overloads a token that already means something, and every screen would then
read as if it were spending its one earned fill (§21.5) on a button.
**A token with two jobs is the mirror of `--color-accent-premium`'s failure**
(§19.6, a token with none) — and it is the harder one to unpick, because
both usages look correct in isolation.

**This satisfies §21.4 rather than bending it.** That clause says buttons
take "ink or the pop colour, **never a fill**". `#D4C9C7` *is* dark's ink
(§23.2), so the primary button is the exact inversion of light's — which
was navy fill with light text. Nothing about §21.4 changes.

**Secondary / ghost:** transparent ground, `--edge` border (3.27 canvas /
4.93 card), `--ink` label. **Not yet specced: the destructive/error fill.**
It carries semantic colour (§21.4 exempts it), it is a sixth surface, and
it must be measured against the ring like this one was.

#### 23.9b — The reveal panel

**Live: ground `#051822` (the card value), particle ink `#D4C9C7`,
`--edge` hairline.** Not tan.

| Option | Particle ink | Boundary vs canvas | Ring |
|---|---|---|---|
| **card `#051822`** | **11.19** | 1.51 — needs the `--edge` hairline | 11.19 |
| tan `#AA7452` | 4.59 | 3.05 — self-sufficient | 4.59 |
| canvas `#2D383E` | 7.43 | 1.00 — invisible, rejected | 7.43 |

Three reasons, in order of weight:

1. **The particles are 2px cells.** Thin marks need contrast far more than
   solid type does; at 4.59 on tan a 2px particle field reads as haze, at
   11.19 it reads as letterforms. **This is the argument that decides it**,
   and it only appears once you know the cell size — which is why §14.2's
   amendment below matters.
2. **The drama is light assembling out of near-black.** On a mid-tone fill
   it is dark-on-tan, which is the flattest version of the one moment the
   product exists to deliver.
3. **It leaves §21.5's one-fill budget unspent on that screen.** The decided
   screen also carries RSVP, booking and rating surfaces; the panel does not
   need to be the thing that spends it, because at ΔL\* 15.5 against the
   canvas it is already a distinct surface without any colour at all.

**Tan remains legal** and its numbers are above if the owner wants the
payoff to carry colour. It costs that screen its one fill.

#### 23.9c — The destructive / error fill (the sixth surface)

§21.4 exempts semantic colour from the fill rules, and `--color-error`
already lives outside the owner's six in both scopes today — so this is not
a new licence, it is an existing exemption being re-measured for dark.

**Both shipped values fail on the dark canvas.** Re-measured on §23.2's
grounds rather than the grounds they were chosen against:

| Existing | Text on card | Text on canvas | Verdict |
|---|---|---|---|
| night `#ff5c5c` | 5.98 | **3.97** | **fails** on canvas |
| light `#b3261e` | 2.77 | 1.84 | fails both (correctly — it is the *light* value) |

`#ff5c5c` is the trap: it clears comfortably on the card and looks fine
wherever it is first checked, then fails on the canvas. **This is §23.10
exactly**, on a token whose whole job is to be noticed.

**Live: `--color-error: #F08A78`** — the one candidate clearing 4.5 on both.

| Role | Measurement |
|---|---|
| Text on card `#051822` | **7.42** |
| Text on canvas `#2D383E` | **4.93** |
| As a destructive **fill**: boundary vs canvas | **4.93** (floor 3.0) |
| Ink on that fill — navy `#051822` | **7.42** |
| Focus ring on that fill | **7.42** (outer band carries it) |

**One value covers both roles**, error text and destructive fill, which is
the opposite of overloading: it is one job (semantic alarm) expressed on two
surfaces, not two jobs sharing a token. **White ink on it measures 2.40 and
is forbidden** — the fill takes navy, like every other light surface in dark
(§23.9a). That will read as unusual to anyone expecting red-fill-white-text;
consistency with the system beats the convention here, and the convention is
a light-mode habit.

Sits in the palette's own warm family — tan is hue ≈23°, this is ≈9°: a
redder, lighter cousin rather than an imported primary red.

**Colour is never the only signal** (`a11y-responsive`): a destructive
action still says what it destroys, and an error still carries text.

### 23.10 — Surface-dependence is general in dark, not a quirk of one token

§23.2 flagged `--muted` as surface-dependent. It has now appeared twice
more — in the reveal panel's inherited ink, and in the ring's outer band
vanishing on `--primary-fill`. **Three instances is a property, not a
coincidence, so state it as a rule:**

> **In dark, a token's legality is a property of the token *and the surface
> under it*, never of the token alone.** Light mode could get away with the
> looser habit because its canvas and card differ by **ΔL\* 3.34** — barely
> two surfaces at all, so a value legal on one was legal on the other.
> Dark separates them by **15.54**, and adds fills at L\* 53.6 and 81.8.
> The same token now crosses a real range.

**What this obliges, concretely:**

- **Every contrast figure in dark is quoted with its ground, or it is not a
  figure.** "`#969A9E` is 6.39" is not a claim; "6.39 on the card, 4.24 on
  the canvas — fails there" is.
- **A component that inherits ink from `getComputedStyle` inherits the
  surface question with it.** `WinnerReveal` reads its family and ink from
  its own computed style — correct, and it means whatever ground the panel
  lands on must define an ink that is legal *on that ground*. §23.9b pins
  both together for exactly this reason.
- **When a new surface is introduced, it is not done until it has been
  measured against the ring** (§23.7), not only against its own text. The
  primary fill was the fifth surface; the destructive fill will be the
  sixth.
- **This is the light-mode habit that must not be carried over**, and it is
  the same shape as the mistake §23.1 fixed: the failure there was
  importing light's *elevation metaphor*, and the failure here would be
  importing light's *one-value-fits-every-ground* assumption. Both look
  harmless until measured.

### 23.11 — Verification  *(was §23.5 before §23.7–23.10 landed)*

- Every text pair re-measured **on both dark grounds**, alpha composited
  through ancestors. `color(srgb …)` must be parsed — three sessions have
  been bitten by naive parsing.
- **Boundaries checked against both neighbours**, not just the card
  interior. A hairline that passes inside and fails outside still fails.
- `--muted` audited specifically for canvas-level usage: it is the one token
  in this set whose legality changes with the surface under it.
- 375 / 768 / 1280 / 1440, per `a11y-responsive`.
- Focus rings: §19.7's inset rule needs re-deriving for dark — graphite
  inset on a near-black card is invisible. **Not solved here; flagged.**
- `prefers-reduced-motion` kills the deal stagger and the particle reveal
  with no layout shift.
- **Every new surface is measured against the ring (§23.7), not only against
  its own text.** The primary fill was the fifth; the destructive fill will
  be the sixth. A surface that carries legible text but kills the focus ring
  is not finished.
- **The reveal ends on its crisp text at the same size it reconstructed**
  — measured rendered-against-reconstructed, not reasoned (§14.2's
  amendment). A jump here lands on the one screen that must not have one.
- **Light's park is watched for ≥90 seconds on a real page** (§23.8), not
  screenshotted. The failure mode is a 60s interval, and no still frame can
  show it.

### 23.12 — Resolved, and what actually remains  *(was §23.6)*

All three of this section's original open questions have been answered.
Kept rather than deleted, because *how* they were settled is the useful part.

- **Light mode's fate — SETTLED 2026-09-07.** Parked, not retired. §23.8.
- **The dark focus ring — SOLVED 2026-09-07.** §23.7. It was the real
  blocker: not polish, but keyboard access failing on the primary surface.
- **`#BF977D` — ACCEPTED 2026-09-07.** Judged a derivation of the owner's
  own tan, in the same family, made legible — the identical move already
  accepted for `muted` / `line` / `error` / `confirm`. It was rejected for
  `#7A5A3E` only because v7's brown made that one *unnecessary*; here it is
  necessary, since tan alone is 3.05 on cards and would force a per-surface
  exception into §21. **Deriving beats exception-ing** — that is the
  reusable form of the rule.

**Still genuinely open:**

- ~~**The dark primary-fill button.**~~ **SPECCED 2026-09-07 — §23.9a.**
  `#D4C9C7` fill, `#051822` ink, and the ring measured against it (the
  outer band vanishes at 1.00 and the inner carries it at 11.19 — the
  two-band design earning its keep on the fifth surface).
- **The destructive / error fill is now the open one.** It carries semantic
  colour, so §21.4 exempts it from the fill rules — but it is a **sixth
  surface** and must be measured against the ring exactly as §23.9a was.
- **`/login`, `/onboarding`, `/privacy`, `/terms`** use a separate `--auth-*`
  token set with no dark variant at all (`a11y-responsive` has this open).
  With dark as the identity these are now white screens mid-flow, which is
  worse than it was when dark was optional.


### 23.13 — The parked night block is not free machinery

§19.2 preserved 45 `[data-theme="night"]` blocks so that reversing the dark
decision would be cheap. **It was, and that discipline paid off.** But those
blocks were tuned against a **`#121212`-era ground**, and §23's canvas is
`#2D383E` — a full 15 L\* lighter.

**Mine them for coverage, then delete them. Write §23's values fresh.**

Reviving them wholesale would import values calibrated for a context that no
longer exists — **structurally the same mistake as §23.1**, which was
importing light mode's elevation metaphor into a ground it did not fit. The
blocks' remaining value is not their colours; it is that they are a
**worked list of every selector that needs dark treatment at all**, built
by someone who walked the whole app once. That coverage is expensive to
recreate and trivial to lose.

**So the order matters, and getting it backwards loses the only useful
part:** extract the selector list *first* and keep it — as a checklist in
the implementing PR, or a comment block — *then* delete the rules. Deleting
before extracting throws away the coverage and keeps nothing.

**One value in them is worth carrying forward as a starting point, not as a
figure:** §19.2's recorded night set was measured, just against the wrong
ground. Treat those numbers as evidence that a given selector *needed* a
value, never as the value itself.

**I audited the three literals inside them. Two are false alarms, and one
of those would do real harm if "fixed".**

1. **`.home-experience .home-grid-field` — not a problem, and not on the
   auth surface.** It is `[data-theme="night"] .home-experience`, i.e. the
   home page, not `/login`. Its two `rgba(255,255,255,0.06)` gradients sit
   under a parent `opacity: 0.22`, so the **effective** alpha is 0.0132 —
   **ΔL\* 1.35 on §23's canvas against 1.31 on the old ground.** Materially
   identical. It was a barely-visible texture before and it stays one.
   Quoting the 0.06 without the parent opacity overstates it by ~4.5×.
2. **`.photo-credit`'s `rgba(10, 9, 10, 0.82)` — do not touch this.** It is
   not a themed surface: it sits **on a photograph**, and the comment above
   it records that it was deliberately densified because the credit measured
   3.86:1 on a 0.62 scrim, under the floor. **Several curated photos are
   CC-BY, where attribution is a condition of use** — lightening this scrim
   because it looks "near-black on near-black" would put a licence
   obligation below the readable floor. It is dark on purpose, over an
   image, in both grounds.
3. **The real finding is the opposite of the reported one.**
   `[data-theme="night"] … .home-plan-card` and friends use
   `rgba(255,255,255,0.035)`, which on §23's canvas composites to `#343f45`
   — **ΔL\* 3.13**. §23.1's own argument is that **ΔL\* 3.34 is too little to
   read as two surfaces**; that is why the light ground looked flat. So this
   chip is *below the threshold this very section set*. **The bug is that it
   will disappear, not that it will appear.** It should take `--card` and
   the §23.1 relationship like every other surface.

**The generalisable point:** a hardcoded literal on a themed surface is this
project's most-repeated bug, but **"it is a literal" is not itself the
finding** — the finding is what it composites to, on the ground it will
actually sit on. Two of these three literals are correct as written. Auditing
by pattern-match flags all three; auditing by measurement keeps the two that
are load-bearing and finds a fourth the pattern missed.

## 24 — The ground, revised: the dark blue is the canvas (owner, 2026-09-07)

Owner, verbatim: **"wait dont use that as the mian color the light blue i
just want the dark blue as the main color"** / *"or wahetevr color that is
the darker ione"*.

**Canvas becomes `#051822`. Cards become `#0B2836`.** This supersedes
§23.1's and §23.2's two ground values. **Everything else in §23 stands** —
tokens, accent, ring, fills, energy — and the figures that changed are
re-quoted below rather than left to be inferred.

### 24.1 — I have to correct §23.1's rule, not just its values

§23.1 concluded that **"cards are wells cut into the ground, not planes
floating above it"**, and the do-not-restore list forbade putting cards
above the canvas. **That generalisation was over-drawn from a single data
point, and it is mine to correct.**

What §23.1 actually measured was that lifting cards from L\* 7.2 to **22.8**
crushed a card interior to one legible tier. That is true, and the
arrangement it rejected is still rejected. But the cause was **the size of
the lift, not its direction** — and I stated it as a rule about direction.

**The correct rule is about magnitude, and it has two bounds:**

> A card must separate from the canvas by **more than ΔL\* ~3.34** — below
> that, two surfaces read as one flat field (§23.1's still-correct finding
> about the near-white ground). And the lift must not be so large that the
> text-carrying surface runs out of headroom. **Direction is free; the band
> between those bounds is what matters.**

`#0B2836` sits at **ΔL\* 7.47** — more than double the lower bound, well
inside the upper. Both surfaces stay strong, which neither the previous
arrangement nor a naive flip achieves.

### 24.2 — Why not `#2D383E` for cards, which is an owner value

Because it reintroduces the exact failure §23.1 was written to prevent,
just less severely:

| Card ground | ΔL\* vs canvas | Body-legal inks on it |
|---|---|---|
| **`#0B2836`** | **7.47** | **4** — light 9.47, white 15.32, accent 5.79, **grey 5.41** |
| `#0E2A38` | 8.43 | 4 — light 9.22, white 14.93, accent 5.64, grey 5.27 |
| `#102E3C` | 10.18 | 4 — light 8.78, white 14.21, accent 5.37, grey 5.02 |
| `#2D383E` | 15.54 | 3 — light 7.43, white 12.02, accent 4.54; **grey 4.24 FAILS** |

**The token that breaks on `#2D383E` is `--muted`.** That is the card's
meta ink — neighbourhood, price, opening time, the second line of every
venue card in the app. Losing it does not cost a shade; it collapses the
card's three-tier hierarchy to two on the app's most repeated component.
**That is the mono-ink problem returning in weaker form**, and it is not
worth paying to keep a hex in the owner's six.

**Correcting one figure in the routed brief:** `#0B2836` carries **four**
body-legal inks, not three — white at 15.32 was omitted. The only ink it
loses against `#051822` is **tan at 4.59**, and **no token consumes tan as
text** (§23.2 lists it as a fill). So the headline "4 tiers versus 3"
difference is entirely in a colour nothing renders. The real comparison is
four against four.

### 24.3 — `#0B2836` is a derivation, and here is the honest case for it

It is not one of the owner's six. Three things, in descending strength:

1. **`--muted` survives on it and dies on the alternative** (§24.2). This is
   the argument; the rest is supporting.
2. **Deriving beats exception-ing** — the same reasoning that carried
   `#BF977D` in §23.3, and `muted` / `line` / `error` / `confirm` before it.
3. **It already ships**, as the top stop of light mode's `--primary-fill`
   gradient (`globals.css:278`, `linear-gradient(180deg, #0b2836, #051822)`).
   **This is the weakest of the three and should not be leaned on**: it shows
   the value is compatible with the palette, not that the owner chose it for
   this job.

**The owner asked which colour the canvas should be. They did not rule on
the card.** If this is judged to cross the no-unpicked-colour line, the
fallback is `#2D383E` cards, and the cost — `--muted` failing on every venue
card — must be stated to the owner rather than absorbed.

### 24.4 — What changes, measured

| Surface / token | Value | On canvas `#051822` | On card `#0B2836` |
|---|---|---|---|
| `--ink-strong` | `#FFFFFF` | 18.10 | 15.32 |
| `--ink` | `#D4C9C7` | 11.19 | 9.47 |
| `--muted` | `#969A9E` | **6.39** | **5.41** |
| `--accent` | `#BF977D` | 6.84 | 5.79 |
| `--color-error` | `#F08A78` | 7.42 | 6.28 |
| `--primary-fill` boundary | `#D4C9C7` | 11.19 | 9.47 |
| `--edge` @ 0.80α | → `#81868b` | **4.52** | **3.98** |

**One of my own figures needed correcting here, and it is worth naming as a
pattern.** §23.2 justified `--edge`'s 0.80α with "at 0.65 it falls to 2.68
and fails". That was true of §23's grounds. On §24's closer pair, **0.65α
clears at 3.10** — the claim expired when the ground moved, exactly like
§23.10's `--muted` example did. **0.80 stays**, for margin; the real floor is
**0.64α at 3.05**, with 0.62α failing at 2.94. A value can outlive the reasoning that chose it, and the
reasoning is what rots first.

**Unchanged:** the accent, the error value, the primary fill and its ink,
the ring's two bands, §21's placement rules, §23.4's energy work.

**Two consequential moves:**

- **The reveal panel must move to `#0B2836`.** §23.9b put it on `#051822`,
  which is now the canvas — it would vanish as a surface. Particle ink
  `#D4C9C7` measures **9.47** there, still far above the 4.59-on-tan that
  §23.9b rejected as haze, so that argument survives the change intact.
- **The focus ring's inner band is now near-invisible on both dark
  grounds** (1.00 on canvas, 1.18 on card) — by design. The outer band
  carries every dark surface (11.19 / 9.47) and the inner band's job is now
  **exclusively the light fills**: `#D4C9C7` 11.19, `#F08A78` 7.42, tan 4.59.
  **The ring is still two-tone and still necessary**; worst case is
  unchanged at 4.59.

### 24.5 — §23.10 has to be restated, not just kept

§23.10 said a token's legality depends on its surface, and used **`--muted`
failing on the canvas at 4.24** as its worked example. **That example is now
gone** — grey clears on both dark grounds (6.39 / 5.41). Leaving a rule
propped up by an instance that no longer holds is how a document rots, so:

> **The rule stands, and its domain has moved.** Canvas and card are now
> 7.47 apart rather than 15.54, so a token legal on one is very likely legal
> on the other — **the surface question is no longer canvas-versus-card. It
> is dark grounds versus the light fills**, and that gap is far wider than
> the one the rule was written for: L\* 7.2–14.7 against 53.6–81.8.

**Every live instance is now a fill**, which is a cleaner rule than the one
it replaces: the ring's outer band vanishing on `--primary-fill`, white ink
being forbidden on `#F08A78`, tan needing navy rather than light. **"Every
contrast figure in dark is quoted with its ground, or it is not a figure"
is unchanged** — only the surfaces it most often catches have changed.

### 24.6 — `#2D383E` now has no job, and that is allowed

It is not the canvas, not the card, and inventing a role for it would be
`--color-accent-premium` exactly: a token created because a value existed
rather than because something rendered it. **Leave it unassigned.** If a
genuinely raised chrome surface appears later — a sticky header band over
scrolled content — it is the obvious candidate, and it can be adopted then,
against measurement, for a consumer that exists.

## 25 — Plan gravity and the voting moment (owner, 2026-09-07)

Owner: **"i just really want it to be aesthetic and fun and interactive at
the end of the day."**

**The palette is frozen at §24. Nothing in this section spends a colour.**
Every effect here is position, scale or timing. Mock:
`design-system/mocks/plan-gravity-v1.html` — interactive, audited at
**120 text nodes, 0 contrast failures**, before and after the round closes.

### 25.1 — The reveal is the headline. Delete the duplicate, and stop rasterising it.

**Two defects, one fix.**

`DecidedPlan.tsx:140` renders `It's {winner.name}.` at `text-xl` (1.25rem)
**directly beneath a canvas already showing that same name at 79px.** §23.4
read this as a type-scale problem. It is not — **it is a duplicate.** The
smaller copy adds nothing and its size is only embarrassing because the
thing above it is correct.

And the canvas itself is soft. `WinnerReveal` draws into a fixed
**400 × 220** backing store and lets CSS stretch it. Measured in the mock's
panel: **5.28× device upscale — the winner's name rasterised at 18.9% of the
screen's real resolution.** In the narrower `.vote-result` column it is
still roughly 3×. **The one moment the product exists to deliver is
currently its blurriest pixels.**

**The fix is to stop treating the canvas as the destination.**

> **The canvas is the transition. Real DOM text is the destination.**

When the particles land, swap the canvas for a real heading: Cormorant 600,
`line-height: .96`, `letter-spacing: -.035em`, `--ink-strong`. Sharp at any
size, selectable, a genuine heading in the accessibility tree rather than a
canvas carrying an `aria-label` — and it makes the duplicate line's deletion
unambiguous, because the settled text *is* the headline.

**⚠️ CORRECTION — I specced `clamp(2.4rem, 7vw, 4rem)` here and it is wrong.
It produces a visible snap on the payoff screen.** The canvas fits its name
to a 400-unit buffer which CSS then stretches, so the particles form the
name at `drawnSize × (panelWidth / 400)`. **A viewport-keyed clamp cannot
know either of those numbers.** Measured in the mock at a 1056px panel:

| Winner | Particles form at | Old clamp settles at | Snap |
|---|---|---|---|
| `3Fils` | 253.4px | 64px | **3.96×** |
| `Brasserie 2.0` | 195.4px | 64px | 3.05× |
| `Common Grounds` | 126.7px | 64px | 1.98× |
| `Reif Japanese Kushiyaki` | 100.3px | 64px | 1.57× |

The name assembles, then instantly shrinks — **and by a different amount for
every winner**, so the same screen behaves differently depending on who won.
This is exactly what §14.2's own amendment warned about and I reintroduced it.

> **The settled text is sized to what the particles actually formed —
> computed, not declared.** `fontSize = drawnSize × (panelWidth / 400)`,
> set at swap time. The CSS clamp survives only as the pre-JS fallback.

**Cap the panel, not the font.** If the reveal is ever placed in a very wide
container the matched size grows with it; give the panel a `max-width` so
the canvas and the text stay in range *together*. Capping the font alone
reintroduces the mismatch this correction exists to remove.

This also settles the open question of whether the heading looked small: it
was not a calmness-versus-payoff trade at all. **It was the wrong size**,
and matching it makes it fill its panel exactly as the particles did.

- **Do the swap on a `setTimeout`, not in the rAF callback.** If the
  animation clock is frozen — a backgrounded tab — the rAF chain never
  completes and the winner is left as a blurry bitmap permanently.
- **Do not fix this by enlarging the backing store alone.** The sampling
  grid must stay 400 × 220 or the particle count blows §14.2's
  1,500–2,500 cap by roughly ten times. Resolution and particle density are
  separate concerns; the swap sidesteps both.
- The canvas becomes `aria-hidden` — it is decoration once real text exists.

**Ship this before the physics.** It is a deletion plus a swap, and it fixes
the product's most important screen.

### 25.2 — Plan gravity: convergence is layout, not simulation

Nine scattered options resolving into one decision is literally what this
app does. Gravity renders that: **options start scattered and pull into
alignment as agreement emerges.**

**The load-bearing decision, and the reason this is affordable:**

> **There is no physics loop.** No per-frame force integration, no
> `requestAnimationFrame` running for the length of a round. Votes arrive as
> discrete Realtime events, so **each vote is exactly one transition** — a
> handful across a whole round, not sixty a second. **Gravity is
> event-driven, not frame-driven.**

**Agreement**, the scalar everything reads from — one pass over nine
integers, recomputed per vote:

```
c = clamp01( (max(vᵢ)/Σv − 1/n) / (1 − 1/n) )
```

An even split reads **0**; unanimity reads **1**. Two channels carry it:

| Channel | Value | Cost |
|---|---|---|
| Per-card scatter | `translate3d(0, calc(var(--off) * (1 - var(--c))), 0)` | compositor only |
| Grid gap | `calc(20px - 11px * var(--c))` | **one layout pass, ≤ once per vote** |
| Leader emphasis | `scale(calc(1 + .045 * var(--lead)))` | compositor only |

`--off` is a fixed per-card offset (0–46px). **Cards animate `transform`
only.** The gap is the single property that costs layout, and it changes at
most once per vote.

**The leader's weight costs no colour**: its hairline goes solid `#969A9E`
— already legal at 6.39 on canvas and 5.41 on card (§24.4) — and it scales
4.5%. **The word "leading" stays in the markup**: §23.4b's rule holds, size
is never the only signal.

### 25.3 — The voting moment: three beats, and only three

The owner has asked twice for restraint. This is not "everything moves".

1. **The vote lands.** The voter's avatar travels from the waiting tray onto
   the chosen card — one element between two positions. In the real build
   that is Motion's `layoutId`, which is precisely the case it exists for.
   **This replaces a counter incrementing:** a number says how many, a face
   says who, and who is why the group is on this screen together.
2. **Weight accrues.** Per §25.2 — scale and a solid hairline, no colour.
3. **The round closes.** Losers **fold** rather than vanish — 340ms, opacity
   plus a 6% scale-down, so the eye can follow where they went. The winner
   takes full width, then **hands off to `WinnerReveal`**. Gravity lands
   *into* that moment rather than competing with it.

**⚠️ The FLIP must not use a transition primed inside `requestAnimationFrame`.**
The mock did this first and it is a real bug, not a harness artifact: that
pattern sets an inline `transform` and relies on the next frame to clear it,
so **if the frame never fires the avatar is stranded at its inverted
position permanently.** Use the Web Animations API —
`el.animate([{transform: inverted}, {transform: 'none'}], {...})` — which
needs no priming frame and leaves no inline style, so the element's resting
place is always its real layout position. Verified: 5 of 5 avatars land in
the card footer with zero residual transforms.

### 25.4 — The performance budget

The critical path is a guest opening a share link on a mid-range Android.

**Structural guarantees** (properties of the implementation, checkable by
reading it):

- **Nothing animates while nobody is voting.** No ambient drift, no idle
  loop. A round can sit open for hours.
- **10 elements transform per vote** — nine cards and one avatar.
- **One property costs a layout pass** (`gap`), at most once per vote.
- **`transform` and `opacity` only.** No blur, no `backdrop-filter`, no
  shadow — and per §23.7 dark has no elevation shadows to lose anyway.
- No persistent `will-change`.

**⚠️ These are structural facts, not a benchmark, and the difference
matters.** A live frame-timer was built into the mock and **removed**:
`requestAnimationFrame` does not run under browser automation, so it read
empty — and **a performance metric that silently reports nothing is worse
than no metric**, which is this repo's dominant bug shape. **The real budget
must be measured on a real device**, not quoted from a laptop. Until it is,
this section claims no frame numbers.

### 25.5 — Reduced motion

Motion needs this handled in JS; the global CSS override cannot reach it.

**Gravity becomes a state rather than a journey.** Cards sit exactly where
agreement says they sit, with no travel — the scatter is still expressed,
it simply does not animate into place. **Nothing informational is lost**,
which is the test: if disabling motion loses meaning, the meaning was
carried by the motion and should not have been.

- Avatars appear on the card without flying.
- Losers disappear without folding; the winner is already at full width.
- The reveal renders its settled text immediately (§25.1's swap fires at once).

### 25.6 — What I did not build, and why

- **Ambient drift, cursor attraction, tilt on option cards.** A round can be
  open for hours and people read menus on this screen. Anything moving while
  someone is reading is a cost with no payer.
- **The other eleven interactions on the owner's list.** Parallax, magnetic
  buttons, page transitions — all portable premium polish that would look
  identical on a banking app. **Gravity is the only one that could not exist
  in another product**, because nine-becoming-one is not a metaphor here, it
  is the feature. That is the whole reason it is worth the effort.
- **Anything that needs photography.** Gravity is positional and works on
  type alone — 76 of 82 spots have no image, and that is the test D1's
  premise failed.

### 25.7 — "This frame will definitely arrive" is a bug, twice over

Two independent defects in one week share a root, so it is stated once as a
rule rather than twice as warnings:

- **The FLIP primed inside `requestAnimationFrame`** (§25.3) sets an inline
  `transform` and relies on the next frame to clear it. No frame, and the
  avatar is stranded at its inverted position **permanently**.
- **The reveal settling from inside its rAF callback** (§25.1) never swaps
  the canvas for real text. No frame, and the winner stays a blurry bitmap
  **permanently**.

> **Never let a visual end-state depend on a frame callback firing.** A
> backgrounded tab, a throttled renderer, or an automated browser all stop
> delivering frames — and in every one of those cases the *user's* end state
> must still be correct. Frame callbacks own the journey; they must never
> own the destination.

The destination belongs to something that cannot be skipped: a `setTimeout`,
a Web Animations `finish` handler, or WAAPI's own bounded effect, which
leaves no inline style at all. **Both bugs were first mistaken for harness
artefacts.** They were not — they are precisely what happens to a real
person who opens a share link, switches apps mid-vote, and comes back.

## 26 — Social, fun, and unmistakably Dubai, with what we already have (owner, 2026-09-07)

Owner: **"What can we do otherwise to make it seem more social, fun, and
interactive while also representing Dubai luxury and modernity?"**

**Palette frozen at §24 — not one new value.** No photographs, no invented
people, no fabricated groups. Every category, name, area and price in the
mock is real data the app already stores. Mock:
`design-system/mocks/social-dubai-v1.html` — **98 text nodes, 0 contrast
failures**, audited against the *ambient worst case* rather than the bare
canvas (§26.1).

### 26.1 — The answer that mattered most: hold the space, don't hide it

The routed brief ended with the better question — *what makes a
group-decision app feel social when nobody else is online?* — and it turned
out to be worth more than the four moves above it.

> **Draw every member of the plan. The ones who have voted as faces; the
> ones who haven't as open seats.**

An **empty seat is a person who hasn't answered yet, not an absence.** It is
drawn, it is countable, and you can see you're waiting on four people without
reading a word. The alternative — rendering only people who have acted —
**makes a plan with one vote look like a tool with one user.**

- Per-card tallies read **"2 of 7"**, not "2 yes". The denominator is the
  group; a bare numerator hides it.
- A dashed open seat is a **UI boundary** and needs SC 1.4.11: measured
  **3.98** against the card. It cannot be softened to a hint.
- **The seats are where §25.3's voting avatars land.** The empty seat is not
  decoration — it is the destination, which is what stops this being a
  drawing of a group and makes it the group's actual state.
- **No new data and no new queries.** The plan already knows its members.

**This is the whole trick: the interface behaves as though it expects
company.** Nothing here needs anybody to be online.

### 26.2 — Ambient light: the canvas finally earns its size

§23.1 said a flat `#051822` is as inert as a flat near-white and the canvas
must earn its size. This is that, and it is the strongest Dubai signal
available without a photograph: **warm light pooling in dark navy is what
the city looks like at night.**

Three `radial-gradient` layers, drifting **96 / 124 / 152 seconds**.
**If you notice it as motion, it is too strong.**

- **Never `filter: blur()`.** A blurred layer at this size is the single most
  expensive thing you can hand a mid-range Android. **A radial-gradient needs
  no blur — the gradient *is* the softness**, painted once into its own layer
  and thereafter only translated. Compositor work, no JS in the ambient path
  at all.
- **`contain: strict`** on the container, `pointer-events: none`,
  `aria-hidden`.

**⚠️ The alphas are a measured ceiling, not a taste setting: 0.10 / 0.08 /
0.06.** Stack all three glows at full peak — impossible given their
positions, so this is the ceiling rather than the expectation — and the
canvas lightens to `#2b2f30`, where `--muted` still reads **4.77** against
the 4.5 floor. **At the alphas I first drew (0.14 / 0.11 / 0.09) that same
stack gives 4.16 and fails.** The atmosphere must never be *able* to eat the
text, even in a configuration that cannot occur.

**This creates a permanent audit hazard, and it must be written into the
check.** Gradients are `background-image`; a `getComputedStyle` walk reads
`backgroundColor` and **sees `rgba(0,0,0,0)`** — so a routine audit will
silently judge canvas-level text against the bare `#051822` and pass
everything. **Canvas-level text is judged against `#2b2f30`**, the ambient
worst case, not the canvas value. Cards are unaffected: `#0B2836` is solid
and sits on top.

### 26.3 — The category field: the fun is the words, not a rainbow

Twenty-three live categories — karaoke, padel, shisha, desert, escape room —
are the most playful data the app owns, and they render as a form control.
Set them in Cormorant at **three sizes** (0.95 / 1.2 / 1.55rem), wrapped as
a field rather than a row. **Density and scale read as *abundance*** — which
is what a night out actually offers — and it costs nothing.

**I am declining the colour half of this, deliberately.** The routed brief
argued §21's ban on colour-by-category was right about cards and over-broad
about chips, and the distinction is a fair one. It still fails on arithmetic:

> **The palette has six values and there are twenty-three categories.**
> "Colour by category" cannot be built from what we have; it can only end as
> the rainbow §21 already retired once.

**The one fill goes to the selected chip** — tan, navy ink, `aria-pressed`.
That is colour keyed to **state**, which is information, and it keeps
§21.5's one-per-screen ceiling intact. If the owner still wants category
colour after seeing this, that is a real conversation — but it needs a
colour system we do not have, **not a tweak**, and it should be put to them
in those terms rather than half-done.

### 26.4 — Scale: finishing §23.4

§23.4 measured 151 rules under 0.9rem against 3 at 2rem+, and never
specified the replacement. **Dubai luxury has scale contrast** — large
confident display against small precise labels. Uniformly small reads as
careful, not confident.

| Role | Value |
|---|---|
| Front-door headline | `clamp(3.2rem, 10vw, 6.4rem)`, Cormorant 500, `line-height: .9`, `-.035em` |
| Section headline | `clamp(1.9rem, 4vw, 2.9rem)`, `line-height: 1`, `-.025em` |
| Plan title | `clamp(1.6rem, 3.4vw, 2.3rem)` |
| Card name | `1.5rem` (was ~0.98rem) |
| Kicker / label | `0.58–0.66rem`, 600, `letter-spacing .13–.2em`, uppercase |
| Body | `0.95rem` hero lede, `0.75–0.82rem` supporting |

**The contrast is the point, not the maximum.** A 6.4rem headline works
*because* the label above it is 0.66rem. Raising everything reproduces the
flatness at a larger size.

### 26.5 — The deck breathes once, then stops

Cards settle in on arrival — 0.8s, `--ease-settle`, 80ms stagger, opacity
and `translateY` only. **Then they are still.**

**No ambient drift on content, no pointer tracking, no tilt.** This is the
front door and people read it; a surface that never stops moving is one
nobody can read a menu on. §25.6 already ruled this out for the round, and
the same reasoning applies harder here.

### 26.6 — Reduced motion, and what it reveals

**The atmosphere stays; only the drift stops.** The glows are a still-life,
not an animation — the Dubai signal survives intact with zero movement.
The deck appears already settled.

**Nothing on this page carries information through movement**, which is the
test §25.5 set: if disabling motion loses meaning, the meaning was in the
motion and shouldn't have been.

### 26.7 — What I did not do

- **No photographs, and nothing that would improve with them.** 76 of 82
  spots have none and will for a while.
- **No fabricated people or groups.** The seats are a plan's real
  membership; the categories are a real table.
- **No new colour, no seventh value, no palette round.** §24 is frozen and
  untouched.
- **No blur, no filter, no shadow, no pointer-driven ambient.** Transform
  and opacity only.

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
