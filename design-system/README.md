# Design system bundle

Snapshot of plan-ind's design for [Claude Design](https://claude.ai/design).

- `build.mjs` — generates the bundle. Tokens are lifted verbatim from
  `app/globals.css` `@theme` and the `.home-experience--night` scope.
- `dist/**` — 9 self-contained preview cards, each with a first-line
  `<!-- @dsCard group="..." -->` marker. Uploaded via the `DesignSync` tool.
- `overview.html` — everything on one page, for a quick look.

```bash
node design-system/build.mjs
```

Previews are generated, not hand-written, so a token change regenerates all of
them instead of drifting across nine copies. **Edit `build.mjs`, never `dist/`.**

## This is the shipped baseline, not the intent

The previews reproduce what the app actually renders — which includes the two
override blocks at `app/globals.css:2936-2954`:

```css
.sky-root, .home-backdrop-grid { display: none !important; }
.token, .home-plan-card        { box-shadow: none !important; }
@media (hover: hover) { a:hover, button:hover, … { transform: none !important; } }
```

Those switch off the signature token shadow and every hover transform on
pointer devices. A richer design exists above them in the same file — a
parallax Dubai skyline that re-tints with the real Asia/Dubai clock, floating
cards, a winner-stamp animation — and none of it renders.

Project: `plan-ind` (`431b82f3-8fed-49ce-b0c3-6acc70b58a93`)
