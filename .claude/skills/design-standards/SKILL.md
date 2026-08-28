---
name: design-standards
description: "plan-ind's binding visual rules — the five-group colour system, the champagne size cut, theme scoping, and what colour is and is not allowed to mean. Use before writing or reviewing any CSS, token, or styled component. Encodes the two rules the owner has already reversed once, so they are not restored by accident."
---

# Design standards

`FRONTEND_DESIGN_STANDARDS.md` is the authority. This is the part that gets got
wrong, with the failure each rule prevents.

**Two sections carry reversal notes. Read them before changing either.** The
Colour section was reversed after the old "never use colour decoratively, do not
add a second accent" rule caused 23 category accents to be built, never rendered,
and deleted. The Motion section was reversed (2026-08-28) after "avoid ornamental
motion" left the app reading flat. Restoring either old wording re-causes the bug
it was reversed for.

## Colour has exactly three jobs

| Job | Token | Where |
|---|---|---|
| **You, and now** — your vote, your finished round, a count that just changed | `--color-live` | vote controls, round dots |
| **The outcome** — the winner, a decided plan | `--vote-metal` / `--color-punch` | winner card, result panel |
| **What kind of night this is** — the category group | `--group` | category tiles, option cards |

Nothing else earns a hue. If something needs to stand out and is not one of those
three, the answer is size, weight and space.

Category colour marks **identity, not state**. It must never appear on the winner
treatment or on anything meaning "you" or "now".

## Non-negotiables

1. **Tokens live in `@theme` in `globals.css`, never in a component block.**
   `.home-experience` and `.vote-experience` each redefined the whole palette
   locally once, so those two screens looked right for weeks while every other
   screen rendered a dead palette. The only permitted local redefinition is a
   theme override — the `--night` scopes.

2. **The group carries the hue, not the category.** 23 categories sort into five
   groups (`components/categoryGroups.ts`). Five is a system a person learns; 23
   is noise. Do not add a sixth and do not split a group.

3. **Select a hue with `data-group`, read it as `var(--group, <fallback>)`.** Put
   `data-group` on the nearest container that owns the category. Never hard-code
   a group hex in a rule.

4. **Pick the champagne token by size, not mood.** `--color-punch` `#9b7d4e` is
   3.42:1 on ivory — large text only (24px+, or 18.66px+ bold). Anything smaller
   — kickers, labels, captions, counts, badges — uses `--color-punch-text`
   `#7a6038` (5.23:1). Night sets both to `#c3a573` (7.86:1); no cut needed there.
   As a border or fill `#9b7d4e` is fine: non-text needs only 3:1.

5. **Every hue clears AA against both grounds, or is scoped per theme.** No single
   hue does both — dark enough for ivory is too dark for night. Cobalt `#2f4bd6`
   is 6.00:1 on ivory and 2.91:1 on night, so night uses `#8aa0ff` at 8.02:1.
   **State the measured ratio in a comment next to the token**, and if you change
   one, change and measure both.

6. **Define nothing you do not render.** A token no surface uses drifts out of
   sync — that is exactly why the previous accents were deleted. Add a colour and
   apply it in the same change.

7. **Colour is never the only signal.** Every coloured element pairs with text or
   shape: the category code inside the strip, `aria-pressed` plus an inset bar on
   a selected tile, the word "Selected" on the winner. Assume a viewer who sees
   none of it.

8. **Focus rings stay graphite and inset.** `outline: 2px solid var(--color-ink);
   outline-offset: -2px`. Never tinted with an accent or a group hue. Inline prose
   links are the only exception to the inset.

9. **No green glowing dots, no pulsing status lights** — anywhere, day or night.
   Cross-enforced by `NEXT_AGENT.md` rule 9. Ambient motion is permitted in the
   night theme (see the Motion section) but a pulse that *means* "live" is state,
   not atmosphere, and stays banned.

## People

Most participants have no account and no photo — a typed name is everything the
app knows. An avatar is **initials on a hue derived from the name**
(`lib/avatar.ts`). Never a stock photo, never a generated face: attaching an
invented likeness to a real person's name fabricates an identity, and this
product does not do that. Avatar colour identifies a *person* and must never
reuse the live accent or champagne, which carry state meaning.

Show faces wherever the data exists. A count says how many; a face says who, and
"who" is the reason a group is looking at the screen together.
