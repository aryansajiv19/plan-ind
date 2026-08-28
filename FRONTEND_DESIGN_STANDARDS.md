# Frontend Design Standards

The user explicitly excluded the original **Product quality** section. The
**Colour** section below was excluded originally and has since been reinstated
and rewritten by owner decision — read its note before changing it. All sections
here are active requirements.

## Visual direction

The default style should be modern, minimal, refined, calm, professional, spacious without wasting space, and distinctive without becoming decorative.

Do not produce generic landing-page templates. Avoid excessive gradients, generic purple-on-white AI styling, glowing borders, excessive glassmorphism, oversized rounded cards, unnecessary floating containers, decorative blobs, excessive shadows, card-like treatment for every section, excessive badges/pills, stock illustrations, arbitrary animation, and emoji as interface icons.

Do not use green glowing dots or pulsing status lights anywhere in the product. Communicate status with clear text and restrained semantic styling.

## Colour

> **This section was rewritten by owner decision.** It previously read "the base
> is ivory, graphite and champagne — it stays that way", "never use colour
> decoratively" and "do not add a second accent". That rule is what caused 23
> category accents to be built, never rendered, and then deleted. The owner has
> reversed it: the product should feel warm and saturated, and *"food, nightlife,
> beach, active should each feel different."* Do not restore the old wording.

The ground is still architectural ivory, graphite and champagne metal. Colour
now sits **on top of** that ground rather than replacing it. It never becomes
the ground itself.

Colour carries exactly three jobs. Nothing else earns a hue.

| Job | Colour | Where |
|---|---|---|
| **You, and now** — your vote, your finished round, a count that just changed | `--color-live` | vote controls, round dots |
| **The outcome** — the winner, a decided plan | champagne (`--vote-metal`, `--color-punch`) | winner card, result panel |
| **What kind of night this is** — the category group | `--group` | category tiles, option cards, place cards |

### The category system

The composer sorts 23 categories into **five groups** (`components/categoryGroups.ts`).
**The group carries the hue, not the category.** Five hues is a system a person
learns; 23 is noise. Do not add a sixth, and do not split a group.

| Group | Day (on ivory) | Night (on obsidian) |
|---|---|---|
| Food & drink — paprika | `#a83a20` · 5.65:1 | `#e0865f` · 6.80:1 |
| After dark — lit magenta | `#b3175f` · 5.81:1 | `#dd7a9c` · 6.44:1 |
| Sun & water — marine teal | `#0f6a72` · 5.60:1 | `#5fb0bb` · 7.39:1 |
| Move and play — pitch green | `#2a6b3c` · 5.69:1 | `#72b083` · 7.25:1 |
| Culture & reset — gallery violet | `#6b46b0` · 5.95:1 | `#a893e8` · 7.03:1 |

Rules for it:

- **Tokens live in `@theme` in `globals.css`, never in a component block.**
  `.home-experience` and `.vote-experience` each redefined the entire palette
  locally once, so those two screens looked right for weeks while every other
  screen rendered the dead old palette. The only permitted local redefinition is
  a **theme override** — the two `--night` scopes, matching how `--color-live`
  already works.
- **A hue is selected with `data-group` and read as `var(--group, <fallback>)`.**
  Put `data-group` on the nearest container that owns the category; never
  hard-code a group hex in a rule.
- **Define nothing you do not render.** A token no surface uses is dead weight
  and drifts out of sync — that is exactly why the previous accents were
  deleted. If you add a group colour, apply it in the same change.
- Category colour marks **identity**, not state. It must not appear on the
  winner treatment or on anything meaning "you" or "now".
- Green is permitted here as the Move-and-play hue on static shapes. It is
  still **never** a dot, a status light, or anything that glows or pulses.

### Champagne and text size

`--color-punch` / `--vote-metal` `#9b7d4e` is **3.42:1 on ivory**. That passes AA
for **large text only** — 24px+, or 18.66px+ bold. It is the display metal.

For anything smaller — kickers, labels, captions, counts, links, badges — use
**`--color-punch-text` `#7a6038`** (5.23:1 on ivory, 5.65:1 on card). It is the
same champagne, cut darker for small sizes. The night scopes set it to `#c3a573`
(7.86:1), where no separate cut is needed.

The brand colour is not darkened. Pick the token by **size**, not by mood. As a
border or fill, `#9b7d4e` is fine — non-text needs only 3:1.

### Everywhere else

- **Colour is never the only signal.** Every coloured element pairs with text or
  shape: the category code inside the strip, `aria-pressed` plus a 3px inset bar
  on a selected tile, the word "Selected" on the winner. Assume a viewer who
  sees none of it.
- **Every hue clears WCAG AA against both grounds, or is scoped per theme.** No
  single hue does both — a colour dark enough for ivory is too dark for night.
  Cobalt `#2f4bd6` is 6.00:1 on ivory and 2.91:1 on night, so night uses
  `#8aa0ff` at 8.02:1. State the measured ratio in a comment next to the token,
  and if you change one, change and measure both.
- **Focus rings stay graphite.** `outline: 2px solid var(--color-ink);
  outline-offset: -2px`, drawn inside the control. Never tint them with an
  accent or a group hue. Inline prose links are the only exception to the inset.
- Colour is not a substitute for hierarchy. If something needs to stand out and
  is not "you", "now", "the outcome" or "what kind of night this is", the answer
  is still size, weight and space.

## People

Most participants on a shared plan link have **no account and no photo** — a
typed name is everything the app knows about them.

- An avatar is **initials on a hue derived from the name** (`lib/avatar.ts`).
  Never a stock photo, never a generated face. Attaching an invented likeness
  to a real person's name is fabricating an identity, and this product does not
  do that.
- Avatar colour identifies a *person*. It must never reuse the live accent or
  champagne, which carry state meaning ("you and now", "the outcome").
- Show faces wherever the data exists. A count says how many; a face says who,
  and "who" is the reason a group is looking at the screen together.

## Layout

- Use clear hierarchy, strong alignment, deliberate spacing, and restrained content widths.
- Let important content breathe without reducing useful information density.
- Keep related elements grouped and avoid nested card containers.
- Design intentionally for mobile, tablet, and desktop rather than scaling desktop down.
- Keep primary actions obvious and secondary actions subordinate.

## Typography

- Use typography appropriate to the product, with no more than two font families.
- Maintain a consistent type scale and readable line lengths.
- Use size, weight, spacing, and contrast deliberately; avoid excessive bold and very light gray body text.
- Use sentence case unless the established brand requires otherwise.

## Components

- Reuse existing components first and extract reusable patterns when they recur.
- Keep APIs simple and composable.
- Include relevant hover, focus, active, loading, disabled, empty, validation, error, and success states.
- Use the project's icon library instead of improvised SVGs or text symbols.
- Keep forms semantic, keyboard-accessible, and correctly labeled.

## Motion

> **This section was rewritten by owner decision (2026-08-28).** It previously
> read "avoid constant movement... and ornamental motion" with no exception. That
> rule, together with the restraint block in `globals.css`, is what left the app
> reading as flat — the owner's words were *"too minimalistic chic sleek… it
> should look fun and not boring to use."* The After Dark night direction, chosen
> in Claude Design, depends on exactly the ambient motion the old rule banned.
> Do not restore the old wording. This is the same kind of reversal as the Colour
> section above, for the same reason.

- Use motion purposefully: entrances, short repeated-element staggers,
  expansion/collapse, state transitions, and action feedback.
- **Bounded ambient motion is permitted in the night theme**, and only there. It
  must satisfy all four:
  - it is *light* — a sheen, a glow, a slow drift. Never bounce, never scale,
    never anything that moves layout;
  - its period is **6 seconds or longer**, so it reads as atmosphere rather than
    activity;
  - it is **decorative only** — it never carries state, and removing it loses no
    information;
  - at most **two** ambient loops are visible on a screen at once. Today that
    budget is spent: the leader sheen and the masthead halo.
- Ambient motion is night-only because it is night-only *legible*: a brass sheen
  on ivory is invisible, so a day-theme equivalent would be movement with no
  payoff.
- Everything else still holds. Avoid animating every element, long transitions,
  and motion that competes with reading.
- **This does not reopen status lights.** Green glowing dots and pulsing status
  indicators remain banned everywhere, day and night — see the Visual direction
  section, and `NEXT_AGENT.md` rule 9, which cross-enforces it. A pulse that
  means "live" is state, not atmosphere, and fails the third rule above.
- Respect `prefers-reduced-motion`. Script-driven animation must check it
  directly — the global `transition-duration` override in `globals.css` cannot
  reach a `requestAnimationFrame` loop.

## Implementation quality

- Use the existing framework and styling system; do not add major dependencies without need.
- Preserve working architecture and keep styles maintainable.
- Use realistic content, leave no nonfunctional controls, and never hide errors with silent fallbacks.
- Preserve accessibility.

## Verification

After UI changes:

1. Run formatting, type checking, and relevant tests.
2. Start or preserve the running application.
3. Inspect in a browser when browser tooling is available.
4. Check approximately 375px, 768px, 1280px, and 1440px widths.
5. Check overflow, wrapping, alignment, spacing, contrast, keyboard navigation, and focus visibility.
6. Fix discovered defects before completion.
