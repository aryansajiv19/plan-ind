# Frontend Design Standards

The user explicitly excluded the original **Product quality** and **Color** sections. The following sections are active requirements.

## Visual direction

The default style should be modern, minimal, refined, calm, professional, spacious without wasting space, and distinctive without becoming decorative.

Do not produce generic landing-page templates. Avoid excessive gradients, generic purple-on-white AI styling, glowing borders, excessive glassmorphism, oversized rounded cards, unnecessary floating containers, decorative blobs, excessive shadows, card-like treatment for every section, excessive badges/pills, stock illustrations, arbitrary animation, and emoji as interface icons.

Do not use green glowing dots or pulsing status lights anywhere in the product. Communicate status with clear text and restrained semantic styling.

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
