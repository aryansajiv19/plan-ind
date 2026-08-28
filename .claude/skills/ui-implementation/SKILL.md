---
name: ui-implementation
description: "How to build UI in plan-ind without re-triggering bugs this repo has already had — Next 16 App Router traps, React 19 effect traps, the CSS restraint block, Realtime cleanup, and theme scoping. Use before writing or editing anything in app/** or components/**."
---

# UI implementation

Training data will steer you wrong twice here: this is **Next.js 16**, whose App
Router APIs differ from what you know, and `app/globals.css` is **Tailwind v4** —
CSS-native `@theme`, no `tailwind.config.ts`. Read `node_modules/next/dist/docs/`
before using an App Router API you have not verified in this tree.

## The restraint block

`app/globals.css` ends with an override block that switches off part of the
design:

```css
.sky-root, .home-backdrop-grid, .home-decision-orbit__glow { display: none !important; }
.token, .home-plan-card, .home-decision-orbit, … { box-shadow: none !important; }
@media (hover: hover) { a:hover, button:hover, [role="button"]:hover, … { transform: none !important; } }
```

Two things follow. **Read it before concluding a style "doesn't work"** — the rule
you just wrote may be live and cancelled here. And **a design relying on hover
transform is cancelled on every pointer device**; one working through light,
border and colour is not. That is why After Dark survives it untouched.

Some targets are already dead — `.sky-root` and `.home-decision-orbit` have no
JSX rendering them. Removing a dead target is safe; removing a live one
(`.home-plan-card`, the blanket hover rule) is a visual change that needs saying.

## Non-negotiables

1. **Never render a dead control.** No empty `booking_url` link, no button that
   does nothing. `NEXT_AGENT.md` rule 1: never show invented data as a signed-in
   user's own. `DemoAccountViews` is fixtures and renders only when `demoMode` is
   true; `AccountViews` is the real one. A screen with no data gets an honest
   empty state, not filler.

2. **Never imply enforcement that does not exist server-side.** If nothing
   rejects a post-deadline vote, the UI must not say the ballot is closed.

3. **`status` is exactly `'open' | 'decided'`.** There is no `closed`. Match
   `lib/types.ts` — and never edit it yourself; file a cross-boundary request to
   `backend-data`.

4. **Always `removeChannel` on unmount.** Every Realtime subscription, filtered by
   `plan_id`. A leaked channel keeps firing into a dead component.

5. **Theme is scoped, not global.** `.vote-experience--night` and
   `.home-experience--night` redefine tokens for their subtree. New night styles
   go under the right scope; they never redefine a token at `:root`.

6. **Script-driven animation must check `prefers-reduced-motion` itself.** The
   global `transition-duration: 0.001ms` override cannot reach a
   `requestAnimationFrame` loop — see `components/CountUp.tsx`, which checks
   `matchMedia` directly and is the pattern to copy.

7. **Extract a shared class or component only after 3+ repeats.** The UI has
   almost no shared abstraction today, which is a real problem — but the fix is
   extracting what actually repeats, not inventing a component library.

8. **Mobile-first at 375px.** Real `<button>` elements, never a clickable `div`.
   No `any` at component boundaries.

## Traps that have already caused real bugs

- **React 19 `setState` in an effect** trips the lint rule; derive during render
  where you can.
- **Scroll-after-`setState`** races — the DOM has not updated when you measure.
- **`router.push` re-runs Server Component queries**, so a "cheap" nav refetches.
- **A CSS comment between rules splits the group** they belonged to.
- **PostgREST `200 []` is ambiguous** — RLS-hidden and genuinely-empty look
  identical. Never infer "no rows exist" from an empty array.
- **Browser screenshots here come back blank** on the bare `screenshot` action;
  the `scroll` action returns a usable image.
