---
name: a11y-responsive
description: "The accessibility and responsive checks plan-ind's own standards mandate, plus the gaps currently open in the tree. Use after any UI change, and before reporting a frontend task done."
---

# Accessibility and responsive

`FRONTEND_DESIGN_STANDARDS.md` mandates these; they are not optional polish. Run
them before you call a frontend task finished.

## The check

1. Render at **375 / 768 / 1280 / 1440px**.
2. Check overflow, wrapping, alignment, spacing.
3. Check contrast — every new pair, measured, against **both** grounds.
4. Check keyboard navigation and focus visibility.
5. Fix what you find before completing.

Design for mobile, tablet and desktop deliberately. Do not scale a desktop
layout down.

## Non-negotiables

1. **44px minimum touch target.** `globals.css` already enforces this in a media
   block for most controls. `.home-avatar` is `2.75rem` = 44×44px
   (`globals.css:797`) — meets the floor, re-checked 2026-09-04.

2. **No hover-only controls.** Anything reachable only by hover is unreachable on
   touch, which is most of this product's traffic. The restraint block cancels
   hover transforms anyway, so a hover-dependent affordance is doubly dead.

3. **Colour is never the only signal.** Pair every coloured state with text or
   shape — `aria-pressed` plus an inset bar, the word "Selected", the category
   code inside the strip.

4. **Focus rings stay graphite and inset**, never tinted:
   `outline: 2px solid var(--color-ink); outline-offset: -2px`. Drawn inside the
   control so it is not clipped by an ancestor's `overflow`.

5. **Decorative text symbols get `aria-hidden`, and carry an `sr-only`
   alternative when they mean something.** Roman numerals are the live example:
   the visible `II` is `aria-hidden`, and an `sr-only` span says "Round 2 of 3",
   because a screen reader renders `III` as "eye-eye-eye".

6. **Wide content scrolls inside its own container**, never the page body.

7. **Respect `prefers-reduced-motion`** — including in JS, which the global CSS
   override cannot reach.

## Currently open in this tree

All three items previously listed here were re-checked 2026-09-04 and are
fixed — recorded so a future pass doesn't inherit a stale gap:

- `.home-avatar` is `2.75rem` = 44×44px (`globals.css:797`), meets the floor.
- `--auth-*` tokens are now defined from `var(--color-*)` (`globals.css:2034-
  2041`), so `/login`, `/onboarding`, and the new `/error`/`/not-found` pages
  follow day/night correctly. `/privacy`/`/terms` were not re-verified in this
  pass — check before assuming.
- The vote page's states are unified in one `<VoteState kind>` component
  (`components/VoteState.tsx`, FE.7), not separate unstyled screens.

No known open items as of this check. Re-verify rather than trust this list
if it's been a while — it goes stale fast in an actively-shipping repo.
