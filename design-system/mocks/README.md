# Mocks

Self-contained comparison pages, built to put a decision in front of the
owner. **None of these are shipped code** — they touch nothing in `app/`,
load fonts from a CDN, and use placeholder photography. Open them in a
browser directly.

| File | Question it answered | Status |
|---|---|---|
| `welcome-fonts.html` | Which display serif? Cormorant vs Newsreader vs EB Garamond, each with a real italic. | **Decided — Cormorant.** Both faces are now vendored in `public/fonts/`. |
| `direction-v6.html` | Restrained frame vs energetic palette vs neutral-plus-one-pop, with photography. | **Decided — direction 1**, then refined into §21's selective-colour rule. |
| `dark-theme-v7.html` | Is dark worth having? Light and dark side by side on v7. | **Open.** This is the artifact the owner's decision rests on — see §19.1's dark subsection. |

## Two cautions for anyone reading these cold

**`direction-v6.html` is built on palette v6, which is dead.** v7 (§19.1)
superseded it. The *directions* it compares are still the live decision;
the hex values in it are not. Do not copy colours out of this file.

**The photography is Lorem Picsum placeholder imagery, with fixed IDs.**
The IDs are pinned deliberately: all directions in a comparison must show
identical images, or the comparison measures the pictures rather than the
design. The live catalogue currently has **0 of 82 spots with a photo**,
which is why these mocks look considerably richer than the real app —
that gap is the point §21.7 makes, not an oversight.

## The one rule these all follow

Every mock was audited in-browser before being sent, with alpha
composited through ancestors and `color(srgb …)` parsed properly. Two
were sent back for real failures found this way — direction 2 failed
seven text checks on its first build, and the dark mock's *light* column
initially used a failing grey that would have flattered light's hierarchy
and made the comparison dishonest in its favour.

A mock that fails its own contrast floors is worse than no mock: it asks
someone to approve something that cannot be built.
