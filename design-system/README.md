# Design system bundle

Snapshot of plan-ind's design for [Claude Design](https://claude.ai/design),
pushed with `/design-sync 431b82f3-8fed-49ce-b0c3-6acc70b58a93`.

- `build.mjs` — generates the bundle. Run it, never edit `dist/`.
- `tokens.mjs` — **reads the live tokens out of `app/globals.css`** at build
  time. The previous bundle hand-copied them and rotted: it still showed
  brass, Manrope and five category hues after all three were retired.
  Parsing the real stylesheet is what makes that impossible.
- `dist/**` — 6 self-contained preview cards, each with a first-line
  `<!-- @dsCard group="..." -->` marker.
- `SPECS.md` — historical: the Wave-1 spec sheet. Superseded by the owner's
  Claude Design handoff (project `fb43b9d4…`) and kept for the record.

```bash
node design-system/build.mjs
```

## What it reflects (2026-09-02)

The design as **shipped on `lane/design`** — the owner's handoff implemented
through step 2, plus two owner calls made on top of it:

- **Colour** — turn 14's two grounds (warm sand `#f4f0ea`, warm near-black
  `#0e0c0e`), selected by the Dubai clock. **Teal accent** (`#12666e` /
  `#68b8c0`) replaced the handoff's brass by owner decision. Terracotta means
  live state only. The five category hues are gone.
- **Type** — **Newsreader** (variable, 200–800) replaced Manrope for display
  after Cobble came in as a reference; Hanken Grotesk stays for body. Two
  families.
- **Depth** — turn 13: pointer parallax and one hairline. The `.token` offset
  shadow is retired.
- **Photo wall** — turn 9 / 10a, with the typographic no-photo tile as the
  common case.

Not yet built, so not previewed: the place page (12a), the home rebuild
(10a's header, hero row and deck panel), the round-and-vote screen, the
collection ring, the keepsake.

## Fixing the design here vs in Claude Design

Edit in Claude Design, then hand the result back as a `.dc.html` the way the
first handoff arrived. Do **not** edit `dist/` by hand — the next
`build.mjs` run overwrites it from the real stylesheet, which is the point.
