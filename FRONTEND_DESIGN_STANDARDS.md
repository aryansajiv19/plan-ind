# Frontend Design Standards

The user explicitly excluded the original **Product quality** section. All
sections here are active requirements. Three sections carry reversal notes —
**Colour, Components (`.token`), and Motion**. Read a reversal note before
touching its section; each one records a rule the owner has already undone
once, so it doesn't get restored by accident.

## Visual direction

The default style should be modern, sleek, and luxurious — while still
reading as fun and energetic, not corporate or muted. This is a real
tension, not a contradiction to paper over: luxury comes from restraint and
richness (a confident dark ground, generous space, few accents used
precisely); fun comes from saturation and warmth (vivid, not muted, accent
colours; real motion; real photography). Hold both at once rather than
picking one and calling it done.

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

> **This section has been rewritten twice.** First reversal (owner
> decision, pre-2026-09): the original "ivory, graphite and champagne, never
> a second accent" rule caused 23 category accents to be built, never
> rendered, and deleted — reversed toward warmth and saturation. Second
> reversal, and the current state (owner decision, 2026-09-04): the
> palette that followed — teal accent, warm sand by day, near-black by
> night — read as **"navy blue and gold"** to the owner and was rejected
> outright, in these words: *"i dont like the navy blue gold theme if we
> switch to more fun colors but the goal is to keep the app looking modern
> sleek luxurious as well."* Root-caused (not guessed) via a full audit
> before the replacement below was written; see `design-system/SPECS.md`
> §1 for the evidence. **Do not restore the rejected teal (`#12666e`/`#68b8c0`,
> the primary/identity accent), brass/champagne, the five category-group
> hues, or the day/night colour split** — retiring any of them re-causes a
> bug or a rejection this file already recorded. This is a different teal
> from job 2 below (`#00E0C7`, a small-only confirm accent) — same word,
> unrelated hue and role; don't conflate them.

**One dark identity. No day/night colour split.** The ground is `#121212`
(near-black, not pure black), surfaces are `#1E1E1E`. This is not a "night
theme" — there is no other theme. (The Dubai-clock time-of-day mechanism
that used to drive this is retired; see `design-system/SPECS.md` §2 for
why and what got deleted.)

Colour carries exactly **four** jobs. Nothing else earns a hue.

| Job | Token | Value | Where |
|---|---|---|---|
| The outcome / primary action | `--color-punch` | `#FF6B4A` coral | primary CTAs — "Create event", "RSVP", "Lock it in" — and the winner treatment |
| You, and now / confirm / active | `--color-live` | `#00E0C7` teal | RSVP confirmed, live/active states, round dots. **Small components only — badges, pills, status text. Never a large surface or a component fill** (a button, a card). This constraint came with the final colour decision after a violet alternative was tried and reverted; it applies specifically because teal reads differently at button/card scale than at badge scale — don't relearn that the hard way |
| Premium marker — **sparing** | `--color-accent-premium` | `#FFD166` gold | badges, streaks. **Never** a button fill, never body text, never more than one or two instances on a screen. This is the one job with a usage limit as well as a colour — treat "sparing" as binding as the hex value |
| Error / urgent | `--color-error` | `#FF5C5C` | validation errors, closing-soon warnings |

### Fill contrast — read this before styling any filled control

Every one of the four accents above is light-to-mid tone. As a **fill**
(a button background, a filled badge), the text on it is **always dark ink
(`#121212`), never white or `--color-ink`**. White-on-coral measures
2.58:1 (fails AA outright); white-on-gold 1.32:1 (fails badly).
Dark-ink-on-coral is 6.65:1; dark-ink-on-gold is 12.99:1. This exact
mistake — a hardcoded light text colour on an accent fill — already existed
in the shipped code once (`text-white` on the old accent, four places,
found and fixed in the 2026-09-04 pass). Don't reintroduce it.

### Text and grounds

| Role | Token | Value | Measured |
|---|---|---|---|
| Ground | `--color-paper` | `#121212` | — |
| Surface (cards, nav, inputs) | `--color-card` | `#1E1E1E` | — |
| Text, primary | `--color-ink` | `#F5F5F5` | 17.18:1 on ground, 15.29:1 on surface |
| Text, secondary/muted | `--color-muted` | `#A0A0A0` | 7.16:1 on ground, 6.38:1 on surface |

Everything that isn't ground or one of the four accent jobs stays surface
grey — cards, nav, inputs — so the accents have room to read as accents
rather than competing with a busy background. This is the owner's own
usage rule, not an inference.

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
  and, later, the teal-era `--color-group-*` tokens had to be deleted.

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

> **This section was rewritten twice.** First (2026-08-28): "avoid
> ornamental motion" left the app reading flat, reversed toward bounded
> ambient motion. That rule was written around a day/night split that no
> longer exists (2026-09-04, see Colour) — the language below is updated
> to drop the "night-only" framing while keeping every actual constraint
> the original rule enforced. **Do not restore a blanket "avoid motion"
> rule** — that's the failure this section exists to prevent a third time.

- Use motion purposefully: entrances, short repeated-element staggers,
  expansion/collapse, state transitions, and action feedback.
- **Bounded ambient motion is permitted** (previously restricted to a
  "night theme" — the whole app is now one dark ground, so this applies
  everywhere, not conditionally). It must satisfy all four:
  - it is *light* — a sheen, a glow, a slow drift. Never bounce, never
    scale, never anything that moves layout;
  - its period is **6 seconds or longer**, so it reads as atmosphere
    rather than activity;
  - it is **decorative only** — it never carries state, and removing it
    loses no information;
  - **at most two** ambient loops are visible on a screen at once.
- A **one-shot** reveal — an animation that runs once on mount and stops —
  is not ambient motion and does not count against the two-loop budget.
  It still respects `prefers-reduced-motion`.
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
