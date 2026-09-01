# Design system bundle

Snapshot of plan-ind's design for [Claude Design](https://claude.ai/design).

- `build.mjs` — generates the bundle. Tokens are lifted verbatim from
  `app/globals.css` `@theme` and the two `--night` scopes.
- `dist/**` — 13 self-contained preview cards, each with a first-line
  `<!-- @dsCard group="..." -->` marker. Uploaded via the `DesignSync` tool.
- `SPECS.md` — the current build sheet handed from T3 (Design) to T2 (Frontend).

```bash
node design-system/build.mjs
```

Previews are generated, not hand-written, so a token change regenerates all of
them instead of drifting across 13 copies. **Edit `build.mjs`, never `dist/`.**
There is no hand-maintained combined page — open a `dist/` card directly, or use
the Claude Design canvas.

## This tracks the shipped design

As of 2026-09-01 the previews reproduce what the app renders. The restraint block
that used to switch off the signature `.token` shadow and every hover transform is
**gone** (`globals.css` — the note in its place records why), so the previews now
show the signature offset shadow live on the vote card and the primary actions,
the way the app does.

Still ahead of the shipped app, deliberately, as design direction for T2:

- **`screens/front-door-after-dark.html`** — the FE.1 hero upgrade (masthead
  halo, hero lattice, brass "Tonight in Dubai" plate). Structure ships today; the
  night atmosphere does not yet.
- **`components/decided-plan.html` + `screens/payoff-after-dark.html`** — FE.5.
  The day panel needs its off-standard Tailwind stripped; the After Dark night
  layer does not exist yet.

A time-keeping Dubai skyline (`.sky-*`, seven `[data-phase]` palettes) sits
dormant in `globals.css`, waiting on FE.3. It is not previewed here until it has
markup again.

Project: `plan-ind` (`431b82f3-8fed-49ce-b0c3-6acc70b58a93`)
