# Frontend Design Standards

The user explicitly excluded the original **Product quality** section. All
sections here are active requirements. Three sections carry reversal notes —
**Colour, Components (`.token`), and Motion**. Read a reversal note before
touching its section; each one records a rule the owner has already undone
once, so it doesn't get restored by accident.

## Visual direction

**Reconciled 2026-09-04.** The brief has moved twice: "fun but modern/sleek/
luxurious" → "avoid too much blank space" → "minimalistic aesthetic luxury."
Read together, not as a contradiction: the dial moves toward luxury/restraint
and away from maximalist/energetic saturation; it does **not** move toward
whitespace. **Minimalistic means restrained and considered — few elements,
each earning its place — not sparse or empty.** Density comes from real
content (photos, data, cards) packed tight with intent; empty margins for
their own sake stay wrong under every version of this brief.

The default style is modern, sleek, and luxurious, built from restraint and
richness — a confident dark ground, few accents used precisely, real
photography, real motion held tight rather than showy. "Fun" now reads as
warmth in the accents and motion that are there, not as more of them.

Avoid generic purple-on-white AI styling, glowing borders, excessive
glassmorphism, oversized rounded cards, unnecessary floating containers,
decorative blobs, excessive shadows, card-like treatment for every section,
excessive badges/pills, stock illustrations, arbitrary animation, and emoji
as interface icons.

Do not use green glowing dots or pulsing status lights anywhere in the
product. Communicate status with clear text and restrained semantic
styling — the one exception is the live/confirm accent's dot (see Colour),
which is a deliberate, restrained pulse, not a "system is online" light.

## Colour

> **This section has been rewritten three times, twice on the same day.**
> First (owner decision, pre-2026-09): "ivory, graphite and champagne,
> never a second accent" caused 23 category accents to be built, never
> rendered, and deleted — reversed toward warmth and saturation. Second
> (owner decision, 2026-09-04): the palette that followed — teal accent,
> warm sand by day, near-black by night — read as **"navy blue and gold"**
> and was rejected outright, replaced with a single dark identity
> (coral/gold/teal on `#121212`, "palette v2"). Third, same day: the
> owner asked for day mode back — *"i like white and navy blue together
> maybe that for the day mode i guess"* — reversing the single-identity
> call. **Current state: two separately authored palettes again
> ("palette v3"), selected by the Dubai clock, per the table below.**
> Full reasoning and measured contrast for every value: `design-system/SPECS.md`
> §1. **Do not restore**: the rejected v1 teal (`#12666e`/`#68b8c0`),
> brass/champagne, the five category-group hues, or a single-identity
> (no-day/night) colour system — each retiring re-causes a bug or a
> rejection already recorded here. Palette v2's coral/gold/teal is also
> superseded — don't restore it either, even though the day/night removal
> it came with is what got reversed, not the hexes themselves.

**Two grounds, separately authored, not one dimmed.** Selected by the
Dubai clock (`lib/dubai-phase.ts`, `components/ThemeSync.tsx` — both stay
live; see `design-system/SPECS.md` §2).

Colour carries exactly **four** jobs. Nothing else earns a hue.

| Job | Token | Night (v3) | Day (proposed) |
|---|---|---|---|
| The outcome / primary action / wordmark | `--color-punch` | `#C9A876` champagne gold | `#1B2A4A` navy |
| You, and now / confirm / active | `--color-live` | `#00E0C7` teal | `#0E7C74` deep teal |
| Premium marker — **sparing** | `--color-accent-premium` | `#5CC8D7` glass-blue | `#8A6D2F` deep gold |
| Error / urgent | `--color-error` | `#FF5C5C` | `#B3261E` |

### Gold-on-navy: settled, deliberately

`#C9A876` champagne gold on the `#0D1117` charcoal-navy ground is
structurally close to the "navy and gold" combination this colour pass
opened by rejecting. That resemblance was flagged, not shipped quietly —
the alternative (glass-blue as primary/wordmark, gold moved to the
sparing badge role) was built and rendered side by side with it in
`design-system/dist/foundations/colour-next.html`. The owner looked at
both and picked gold-as-primary anyway: the resemblance is a deliberate
direction, not a drift back. **This is final — build it with confidence,
don't re-litigate it.** The alternative render stays in the design-system
bundle for the record, not as a live option.

### Fill contrast — read this before styling any filled control

Every accent above is light-to-mid tone at night, mid-to-dark by day. As a
**fill** (a button background, a filled badge), the text on it takes the
*opposite* end of the scale from the accent itself — dark ink on a light
night-fill, and (day's one asymmetry) white/light ink on day's navy
primary specifically, since navy is dark enough to need it. Check each
value, don't assume night's pattern (dark ink always) carries over to day
unchanged. This exact mistake — a hardcoded wrong-contrast text colour on
an accent fill — already shipped once (`text-white` on the v1 teal
accent, four places, found and fixed 2026-09-04). Don't reintroduce it a
third time.

### Text and grounds

| Role | Token | Night | Day |
|---|---|---|---|
| Ground | `--color-paper` | `#0D1117` | `#F7F7F5` |
| Surface | `--color-card` | `#161B22` | `#FFFFFF` |
| Text, primary | `--color-ink` | `#F2EFE9` | `#141414` |
| Text, secondary/muted | `--color-muted` | `#8A8F98` | `#5B5F66` |

Everything that isn't ground or one of the four accent jobs stays surface
grey — cards, nav, inputs — so the accents have room to read as accents
rather than competing with a busy background. This is the owner's own
usage rule, not an inference; it survived the v2→v3 churn unchanged.

### The category system is retired

The five category-group hues (`components/categoryGroups.ts`) are gone.
`data-group` no longer selects a colour anywhere. `categoryGroups.ts`
survives only as composer-tab structure — do not give it a colour again.
What kind of night it is comes from photography and copy, not a hue.

### Everywhere else

- **Colour is never the only signal.** Every coloured element pairs with
  text or shape — `aria-pressed`, an explicit label, a checkmark on a
  confirm state. Assume a viewer who sees none of it.
- **Focus rings**: `outline: 2px solid var(--color-ink); outline-offset:
  -2px`, drawn inside the control. Never tinted with an accent. Inline
  prose links are the only exception to the inset.
- Colour is not a substitute for hierarchy. If something needs to stand
  out and is not one of the four jobs above, the answer is still size,
  weight and space.
- **If you add a colour, apply it in the same change.** A token nothing
  renders drifts out of sync — that's exactly why the 23 category accents
  and, later, the v2-era `--color-group-*` tokens had to be deleted.


## People

Most participants on a shared plan link have **no account and no photo** —
a typed name is everything the app knows about them.

- An avatar is **initials on a hue derived from the name** (`lib/avatar.ts`).
  Never a stock photo, never a generated face. Attaching an invented
  likeness to a real person's name is fabricating an identity, and this
  product does not do that.
- Avatar colour identifies a *person*. It must never reuse one of the four
  job colours above, which all carry state or hierarchy meaning.
- Show faces wherever the data exists. A count says how many; a face says
  who, and "who" is the reason a group is looking at the screen together.

## Layout

- Use clear hierarchy, strong alignment, deliberate spacing, and
  restrained content widths. **One container-width system, applied
  everywhere** — a page whose sections sit on different rail widths reads
  as misaligned even when each section is internally correct; this was a
  real, shipped bug (six different widths across `app/globals.css`, fixed
  2026-09-04 — see `design-system/SPECS.md` §3.1).
- Prefer `%`-based centring over `100vw`-based centring for anything that
  must align with sibling elements — `100vw` includes the scrollbar,
  `%` doesn't, and the difference is a silent few-pixel misalignment on
  any desktop with a classic scrollbar.
- `overflow: hidden` on a layout container is a last resort, not a
  default — it silently clips anything that overflows instead of making
  the overflow visible (a scrollbar, a wrap), which turns a loud bug into
  a quiet one. Reach for it only when the thing it's clipping is
  deliberate (e.g. a photo bleeding past a rounded corner), never as a
  blanket container-level rule.
- Let important content breathe without reducing useful information
  density.
- Keep related elements grouped and avoid nested card containers.
- Design intentionally for mobile, tablet, and desktop rather than scaling
  desktop down. Check the width range between breakpoints, not just at
  them — a nav that fits at 520px and at 1024px can still overflow at
  640px if nothing between those two was checked.
- Keep primary actions obvious and secondary actions subordinate.

## Typography

- Two font families: **Newsreader** (variable, wght 200–800) for display —
  hero, titles, section heads, the wordmark — and **Hanken Grotesk** for
  body, labels, chips, numerals. The serif replaced the original
  handoff's Manrope after a design reference (Cobble) made the case for an
  editorial pairing over a geometric-sans one; it is also the sleeker of
  the two for this ground.
- Display sits at weight 400–600 for most uses, not 800 — a serif's own
  stroke contrast carries a headline, and 800 goes blobby at display
  sizes. The one exception is a **one-shot** weight-rise entrance (300→800
  over 1.4s, then holds) on the front-door headline, which needs the
  weight range specifically because it's animating through it, not sitting
  at the endpoint.
- Tracking: `-0.03em` on display headings. Values tighter than that (the
  original handoff's `-0.06em`/`-0.08em`) were tuned for a geometric sans
  and crush a serif's own sidebearings at display size.
- Maintain a consistent type scale and readable line lengths.
- Use size, weight, spacing, and contrast deliberately; avoid excessive
  bold and very light grey body text.
- Use sentence case unless the established brand requires otherwise.
- **No dashes anywhere in UI copy** (owner rule, 2026-09-04) — headings,
  body, buttons, empty/error/loading states, all of it. Split into two
  sentences or use a comma instead. Applies to example copy written in
  specs too, since that copy tends to ship close to verbatim — two literal
  instances were caught and rewritten in `design-system/build.mjs`'s
  preview cards under this rule ("RSVP confirmed, 4 of 6",
  "No panorama and no venue set. Twelve guest photos, last one in
  March."). Documentation prose (this file, `SPECS.md`'s own commentary)
  is not UI copy and is unaffected.

## Components

- **Prioritise shadcn + Motion (owner, 2026-09-04).** For any new UI element
  that maps to a standard primitive, add it from the `@shadcn` registry
  (`components.json` already has `style: "new-york"`, `baseColor: "neutral"`,
  `cssVariables: true` — it repoints onto this project's tokens, not
  shadcn's defaults) instead of hand-rolling markup. Confirmed available and
  relevant to the open build-out: `tabs` (place page's Photos / 360 tour /
  Your friends / Menu row, `SPECS.md` §6), `badge` (streak + premium
  markers), `avatar` (the "shot by your friends" rail and the header
  presence stack), `button` (any net-new CTA that isn't already one of the
  app's existing primary/ghost patterns). Re-token every shadcn install
  through this project's CSS variables before use — never ship it in
  shadcn's own default palette. Where an existing hand-built component
  already does the job well (the vote/place cards, `TiltCard`), keep it —
  this is a default for **new** primitives, not a mandate to rebuild what
  already works. Motion (the animation library) is the paired default for
  any interaction/transition on top of these — see Motion below, now
  rewritten with the owner's specific animation direction.
- Reuse existing components first and extract reusable patterns when they
  recur. Before building a new component, check `components/` for one
  already built and unwired — `components/kokonutui/card-stack.tsx` and
  `components/kokonutui/action-search-bar.tsx` are both pre-built,
  re-tokenised, and currently unused; the home rebuild wires them in
  rather than rebuilding from scratch.
- Keep APIs simple and composable.
- Include relevant hover, focus, active, loading, disabled, empty,
  validation, error, and success states.
- **No icon library.** This project deliberately has none — text and shape
  carry meaning instead (a label, a checkmark glyph in copy, a filled vs.
  outline state). `lucide-react` was added as a transitive dependency of a
  vendored component and is being removed (owner's anti-vibecoded list
  explicitly flags Lucide icons and icon-in-a-coloured-rounded-square); its
  one usage (`components/kokonutui/action-search-bar.tsx`) goes back to
  text-only. Don't add an icon library to solve a future problem — solve it
  with text first, the way every other screen in this app already does.
- Keep forms semantic, keyboard-accessible, and correctly labeled.

### The signature element — retired

> **Reversal note.** `.token` used to be a hard, solid offset shadow
> (arcade-button / board-game token) on decision-committing surfaces. It
> is **gone**, retired during the Claude Design handoff's turn-13 pass
> ("3D as an effect, not a place" — turn 8's offset-shadow language was
> explicitly rejected as loud). **Do not reintroduce an offset shadow as
> the app's signature depth cue.** What replaced it — pointer parallax via
> `components/TiltCard.tsx` plus a single hairline border — is itself
> being reconsidered as part of the 2026-09-04 pass (see
> `design-system/SPECS.md` §3.4, §5); the load-bearing rule either way is
> **no hard offset shadow**, not any specific replacement mechanism.
- Depth now comes from **restraint**: a single-tone surface (`--color-card`
  on `--color-paper`), generous space, and — where used — pointer
  parallax. Not stacked shadows, not gradients-for-depth, not borders on
  every element.

## Motion

> **This section was rewritten four times.** First (2026-08-28): "avoid
> ornamental motion" left the app reading flat, reversed toward bounded
> ambient motion, night-only. Second (2026-09-04, briefly): day/night
> colour was retired, so the rule dropped its "night-only" framing.
> Third, same day: day/night is back (see Colour) — **night-only framing
> is restored**, for the same physical reason it existed the first time —
> a light sheen or glow is illegible against `#F7F7F5`/white, so a
> day-ground equivalent would be motion with no visual payoff. Fourth
> (2026-09-04, owner's direct animation brief): adds a concrete direction
> on top of the existing ambient-motion rules below — shared-element
> transitions, hero parallax, shimmer skeletons, and a **tightened,
> no-bounce press feedback rule that reverses `--ease-spring`'s use on tap
> interactions specifically** (see below — this is a real code change, not
> just doc text: `--ease-spring` currently drives press feedback in at
> least 7 places in `app/globals.css`). **Do not restore a blanket "avoid
> motion" rule** — that's the failure this section exists to prevent a
> fifth time.

- Use motion purposefully: entrances, short repeated-element staggers,
  expansion/collapse, state transitions, and action feedback.
- **Bounded ambient motion is permitted in the night ground, and only
  there.** It must satisfy all four:
  - it is *light* — a sheen, a glow, a slow drift. Never bounce, never
    scale, never anything that moves layout;
  - its period is **6 seconds or longer**, so it reads as atmosphere
    rather than activity;
  - it is **decorative only** — it never carries state, and removing it
    loses no information;
  - **at most two** ambient loops are visible on a screen at once.
- A **one-shot** reveal — an animation that runs once on mount and stops —
  is not ambient motion and does not count against the two-loop budget,
  and is not restricted to night the way ambient motion is. It still
  respects `prefers-reduced-motion`.
- Everything else still holds. Avoid animating every element, long
  transitions, and motion that competes with reading.
- **This does not reopen status lights.** Green glowing dots and pulsing
  "system online" indicators remain banned everywhere. The live/confirm
  accent's dot (Colour, job 2) is a deliberate exception with a specific
  meaning ("this is happening now"), not a general licence for pulsing UI.
- Respect `prefers-reduced-motion`. Script-driven animation must check it
  directly — a global `transition-duration` CSS override cannot reach a
  `requestAnimationFrame` loop (e.g. `components/TiltCard.tsx`'s pointer
  parallax, which checks `useReducedMotion()` and disables outright rather
  than shortening).

### Animation direction (owner, 2026-09-04) — build with Motion

Five concrete directions, given with explicit latitude on execution
("take it as you wish" — interpret the *what*, the *how* is ours to spec).
Build all of these with the Motion library, paired with the shadcn-first
rule above — not bespoke CSS keyframes, except where noted.

- **Shared-element transitions, card → detail expand.** The photo-wall
  tile and place card that opens `app/place/[id]/page.tsx` (`SPECS.md` §6)
  should visually continue into the hero photo, not cut/replace. Use
  Motion's `layoutId` on the shared photo element between the card and the
  detail hero — same `layoutId` string keyed by spot id in both
  `PhotoTile.tsx`/place-card markup and the place-page hero. Fast: target
  ≤350ms, `--ease-settle`, no overshoot.
- **Subtle parallax on hero images.** Beyond `TiltCard`'s existing
  pointer-parallax (home hero, `HomeExperience.tsx:310`): the place page's
  460px hero photo (`SPECS.md` §6) gets a light scroll-parallax — image
  translates at roughly 0.85–0.9× scroll speed within its own frame, never
  the reverse (never faster than scroll), clipped to the hero's own
  bounds so nothing leaks past it. Respects `prefers-reduced-motion`
  (disable outright, matching `TiltCard`'s existing pattern).
- **Micro-interactions: soft fade/scale, no bounce or squish.** This
  **reverses `--ease-spring`'s use for press feedback** (`app/globals.css`
  lines 285, 998, 1553, 1819, 2434, 2559, 2669 — every `transform ...
  var(--ease-spring)` currently driving a `:active`/tap state). Replace
  those press transitions with `--ease-settle` (already the no-overshoot
  token, defined `app/globals.css:82`) and keep the effect to scale-only
  (e.g. `scale(0.97)`) or fade+scale together — never a scale that
  overshoots past 1 on release. `--ease-spring` itself stays defined and
  is still fine for non-tap uses if any exist (verify each of the 7 sites
  is actually press feedback before touching it — don't blanket-delete the
  token). This is a real visual change to every existing button/card press
  in the app, not just new components — treat it as a global sweep, not a
  per-component judgment call.
- **Elegant skeleton shimmer, no spinners.** `.wall-skeleton`
  (`app/globals.css:3518`) is currently a static flat block — border,
  radius, flat `--color-accent-tint` fill, no animation at all. Add a
  shimmer: a soft diagonal highlight band sweeping left-to-right,
  `background: linear-gradient(100deg, transparent 30%, var(--color-hairline-loud, rgba(255,255,255,.08)) 50%, transparent 70%)`
  (tune the highlight colour per ground — night needs a lighter sweep,
  day a darker one, verified per-ground like every other colour value in
  this doc) over `background-size: 200% 100%`, animating
  `background-position` 0%→200% on a ~1.6s loop, `ease` (linear reads
  mechanical here — ease is fine for a loop this short). Audit
  `app/globals.css` for any other static skeleton/loading placeholder and
  apply the same treatment — `.wall-skeleton` is the one confirmed so far,
  not necessarily the only one. Any remaining spinner (`<Spinner>`,
  a CSS `@keyframes spin`) gets replaced with a shimmer or a
  content-shaped skeleton, not kept.
- **No confetti, sparkles, or gamified pop-ups.** Applies directly to the
  streak/premium-badge feature (Colour, job 3) and any future
  milestone/achievement moment — a state change communicates through the
  existing colour/type system (a badge appearing, a status line updating),
  never a celebratory overlay, particle burst, or modal congratulating the
  user. This is consistent with, not a new addition to, the existing "no
  green glowing dots," "no gamified pop-ups" and anti-vibecoded rules
  already in this file and `PRODUCTION_CHECKLISTS.md`.

## Implementation quality

- Use the existing framework and styling system; do not add major
  dependencies without need.
- Preserve working architecture and keep styles maintainable.
- Use realistic content, leave no nonfunctional controls, and never hide
  errors with silent fallbacks.
- Preserve accessibility.

## Verification

After UI changes:

1. Run formatting, type checking, and relevant tests.
2. Start or preserve the running application.
3. Inspect in a browser when browser tooling is available.
4. Check approximately 375px, 768px, 1280px, and 1440px widths — **and the
   range between them**, not just the four points. A real bug (nav overflow
   between ~521px and ~701px) shipped once specifically because only the
   named breakpoints were checked.
5. Check overflow, wrapping, alignment, spacing, contrast, keyboard
   navigation, and focus visibility.
6. Fix discovered defects before completion.
