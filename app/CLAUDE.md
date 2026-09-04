# Working in `app/` and `components/`

Loads only for sessions touching UI. Root `CLAUDE.md` has the invariants.

## Traps that have already caused real bugs here

Not hypotheticals — every one of these shipped a bug in this repo.

- **`setState` inside a `useEffect` body fails lint** (React 19
  `react-hooks/set-state-in-effect`). Derive the value instead, or fetch in the
  Server Component and pass it down.
- **Do not scroll in a click handler after `setState`.** The DOM has not
  updated yet; the scroll is undone when the old view unmounts. Put it in an
  effect keyed on the value that changed.
- **Do not use `router.push` for tab or view state on `/home`.** Its Server
  Component runs three Supabase queries and they all re-run. Use
  `window.history.pushState` — Next supports it, costs zero requests.
- **A CSS comment between selectors does not split a rule group.** A comment
  above the last selector in a comma list silently applied that block to every
  selector above it too.
- **Focus rings must not project outward.** Controls sit 0–9px apart. Use
  `outline: 2px solid var(--color-ink); outline-offset: -2px`. Inline prose
  links are the only exception (`outline-offset: 1px`).
- **Define colours in `@theme` in `app/globals.css`, not per-component.** The
  old palette survived for weeks because `.home-experience` and
  `.vote-experience` each redefined every token locally, so any screen outside
  those two classes rendered wrong. This recurred in 2026-09: local `--night`
  classes fighting the document `data-theme` made the front-door CTA render
  cream-on-cream. **One source of truth for theme.**
- **Tailwind v4 tree-shakes unreferenced `@theme` vars.** A token consumed only
  via `var()` gets dropped. Put those in `:root`.
- **Screenshots in this environment are unreliable.** `HomeExperience` gates
  content behind `opacity: 0` + a `requestAnimationFrame` entrance; a
  backgrounded Chrome window freezes rendering so rAF never fires and the page
  looks broken when it isn't. Confirm anything visual with `getComputedStyle` /
  `getBoundingClientRect`, or force the entrance end-state before capturing.
- **Clean up Realtime subscriptions.** An uncleaned channel survives navigation
  and double-fires handlers.

## Rules

- **Never show invented data as a signed-in user's own.** `DemoAccountViews` is
  fixtures and renders **only** when `demoMode` is true (`/home-preview`).
  `AccountViews` is the real one. No data → write an honest empty state.
- **Never read date of birth from `auth.user_metadata`** — the browser can
  rewrite it. Use `memberAge()` / `current_member_age()`.
- **Tap targets ≥ 44px.** Enforced in `globals.css`; don't regress it.
- **Respect `prefers-reduced-motion`.** Existing CSS is authoritative and
  disables animation/transition effects — new motion must degrade through it.
- **No green glowing dots or pulsing status lights.** Recorded permanently in
  `FRONTEND_DESIGN_STANDARDS.md`.
- **This is Next.js 16 / React 19** — APIs differ from training data. Check
  `node_modules/next/dist/docs/` before using an App Router API you have not
  verified in this version.

## Deeper reference

`FRONTEND_DESIGN_STANDARDS.md` (binding visual rules),
`design-system/SPECS.md` (current specs from Design),
`.claude/skills/ui-implementation`, `.claude/skills/design-standards`,
`.claude/skills/a11y-responsive`.
