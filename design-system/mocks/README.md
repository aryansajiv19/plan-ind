# Mocks

Self-contained comparison pages, built to put a decision in front of the
owner. **None of these are shipped code** — they touch nothing in `app/`,
load fonts from a CDN, and use placeholder photography. Open them in a
browser directly.

| File | Question it answered | Status |
|---|---|---|
| `welcome-fonts.html` | Which display serif? Cormorant vs Newsreader vs EB Garamond, each with a real italic. | **Decided — Cormorant.** Both faces are now vendored in `public/fonts/`. |
| `direction-v6.html` | Restrained frame vs energetic palette vs neutral-plus-one-pop, with photography. | **Decided — direction 1**, then refined into §21's selective-colour rule. |
| `dark-theme-v7.html` | Is dark worth having? Light and dark side by side on v7. | **Decided — yes**, 2026-09-07. **But its arrangement is superseded:** it put cards *above* the canvas, which is the cause of the mono-ink flattening it honestly reported. §23.1 inverts that. Do not copy its ground/card pairing. |
| `energy-v1.html` | Where does energy come from in a photo-less, text-heavy app? Diagnosis + three moments, on the **light** ground. | **Superseded as a direction** by `energy-dark-v1.html`. Its *diagnosis* still stands and is the cleanest isolation of the energy variable alone, on the ground the app shipped at the time. |
| `plan-gravity-v1.html` | What do the two signature interactions feel like? **Interactive** — click cards to vote and watch agreement collapse the scatter. | **Live — specced as §25.** Also where the `WinnerReveal` rasterisation defect (5.28× device upscale) was found. |
| `energy-dark-v1.html` | What does the app look like if dark is the identity and energy is the goal? | **Live — this is the direction.** Specced as §23, **grounds revised by §24** (canvas `#051822`, cards `#0B2836`). Updated in place, so it shows the live arrangement, not the superseded one. |

## Two cautions for anyone reading these cold

**`direction-v6.html` is built on palette v6, which is dead.** v7 (§19.1)
superseded it. The *directions* it compares are still the live decision;
the hex values in it are not. Do not copy colours out of this file.

**Two of these mocks are light-ground and the app is now dark-ground.**
`direction-v6.html` and `energy-v1.html` both predate the 2026-09-07 dark
decision (§23), and `dark-theme-v7.html` predates the elevation inversion
that decision required. All three remain useful for the questions they
answered. **None of them is a colour reference any more** — §23.2 is.

**The photography is Lorem Picsum placeholder imagery, with fixed IDs.**
The IDs are pinned deliberately: all directions in a comparison must show
identical images, or the comparison measures the pictures rather than the
design.

The live catalogue has **6 of 82 spots with a photo** (migration 039,
applied 2026-09-07). The earlier mocks show photography on every card,
which is why they look considerably richer than the real app — **that gap
is what made D1's premise fail**, and it is why `energy-v1.html` and
`energy-dark-v1.html` deliberately show the honest 2-of-3-empty state
instead.

## The one rule these all follow

Every mock was audited in-browser before being sent, with alpha
composited through ancestors and `color(srgb …)` parsed properly. Two
were sent back for real failures found this way — direction 2 failed
seven text checks on its first build, and the dark mock's *light* column
initially used a failing grey that would have flattered light's hierarchy
and made the comparison dishonest in its favour.

A mock that fails its own contrast floors is worse than no mock: it asks
someone to approve something that cannot be built.
