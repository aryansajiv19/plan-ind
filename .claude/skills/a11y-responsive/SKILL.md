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
   block for most controls. Known open gap: `.home-avatar` is `2.5rem` = 40×40px
   and sits in the persistent nav on all five tabs.

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

- `.home-avatar` at 40×40px (`globals.css:631`) — below the 44px the same file
  enforces at `:2850`.
- `/login` and `/onboarding` use a separate `--auth-*` token set with **no night
  variant**; `/privacy` and `/terms` have no theme awareness at all. Once the
  theme follows the Dubai clock, an after-sunset visitor hits white screens
  mid-flow.
- The vote page's `loading` / `error` / `captcha` / `notfound` states are
  unstyled and inconsistent with each other — a real first-touch surface for a
  guest arriving on an expired link.
