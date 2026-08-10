# Frontend Design Standards

The user explicitly excluded the original **Product quality** and **Color** sections. The following sections are active requirements.

## Visual direction

The default style should be modern, minimal, refined, calm, professional, spacious without wasting space, and distinctive without becoming decorative.

Do not produce generic landing-page templates. Avoid excessive gradients, generic purple-on-white AI styling, glowing borders, excessive glassmorphism, oversized rounded cards, unnecessary floating containers, decorative blobs, excessive shadows, card-like treatment for every section, excessive badges/pills, stock illustrations, arbitrary animation, and emoji as interface icons.

Do not use green glowing dots or pulsing status lights anywhere in the product. Communicate status with clear text and restrained semantic styling.

## Colour

The base is architectural ivory, graphite and champagne metal. It stays that way.

There is exactly **one** live accent, `--color-live`, and it marks **state only**:

| Meaning | Colour |
|---|---|
| **You, and now** — your vote, your finished round, a count that just changed | `--color-live` |
| **The outcome** — the winner, a decided plan | champagne (`--vote-metal`) |
| Everything else | ivory and graphite |

Rules:

- Never use colour decoratively. If it does not mark a state, it is ivory or graphite.
- The accent is **theme-scoped**. No single hue clears WCAG AA on both the ivory
  ground and the obsidian night ground — cobalt `#2f4bd6` is 6.00:1 on ivory but
  2.91:1 on night, so night uses `#8aa0ff` at 8.02:1. If you change the accent,
  change both and check both.
- Do not tint focus rings with it. Those are graphite for contrast reasons.
- Do not add a second accent. If something needs to stand out and is not "you",
  "now" or "the outcome", the answer is hierarchy, not another colour.

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

- Use motion sparingly and purposefully: subtle entrances, short repeated-element staggers, expansion/collapse, state transitions, and action feedback.
- Avoid constant movement, animating every element, long transitions, and ornamental motion.
- Respect `prefers-reduced-motion`.

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
