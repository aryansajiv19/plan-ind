# Why it doesn't feel like Dubai, and doesn't feel fun

**Written 2026-09-07, at the owner's most important piece of feedback of the
project. Read this before proposing any more palette work.**

The owner, verbatim:

> "There's something about the orange and the navy blue that just doesn't sit
> with me right now. What I like about my current web app is that it's really
> clean. It's very sleek. It does look a bit modern, but it's not reading
> Dubai at all: the sparks, the luxury. At the same time, it's not giving the
> aesthetics like Instagram, Belly, Pinterest, and those fun social planning
> apps with a lot of interactive animations and effects. It's not giving any
> of those, and I don't know how to make it give it."

---

## The honest diagnosis: we spent a day solving the wrong problem

**Nine palette revisions in one day.** v3 navy/gold → warm desert → v5 deep
browns/teals → v6 five hexes → v7 six hexes → dark inversion → §24 ground
swap → §27 vermilion. Each one measured carefully, each one shipped, and the
owner's complaint has not moved once.

**That is the finding.** When nine attempts at a variable do not move the
outcome, the variable is not the cause. The palette was never the problem and
a tenth will not fix it either.

---

## What is actually wrong

### 1. The app is sparse, and no palette fixes sparse

Instagram, Pinterest and the social-planning apps the owner names all feel
alive for the same reason: **they are full.** A wall of content, edge to edge,
more than you can take in. Density *is* the aesthetic.

This app shows **three cards at a time**, on a large empty ground, in a
restrained frame. It is sparse by construction. Every design decision so far
has made the frame better and left the sparseness untouched.

### 2. Content is the interface in those apps. Here the interface is the app.

In Instagram the design is a thin chrome around photographs. The colour, the
energy and the variety all come from **content the app did not design**.

Here there are **6 photos across 82 venues**, so the palette is being asked
to supply all the visual interest by itself. It cannot. No palette can. That
is why every round has felt like it nearly worked and then did not.

### 3. The structure is a form, and forms are not fun

This is probably the deepest one, and it is a **product-shape** observation
rather than a visual one.

- Instagram and Pinterest are **browse-first**: content immediately, no input
  required, reward before effort.
- This app is **configure-first**: choose a category, a budget, an area, a
  radius — *then* receive nine results.

A form cannot feel like a feed no matter how it is styled. The most beautiful
form in the world is still a form. If the owner wants the feel of those apps,
the entry point has to change shape — content first, configuration later or
never.

### 4. "Dubai luxury" is not navy and tan

The palette work has been reaching for *restraint* — editorial, calm, matte,
quiet. That reads as expensive European magazine.

Dubai's visual language is close to the opposite: **gloss, extreme contrast,
real metallics, scale, reflection, night photography of a skyline that is
itself the brand.** Gold on black, not tan on navy. Big, not restrained.

Restraint and "sparks" are pulling in opposite directions, and the project has
been buying restraint every round while the owner keeps asking for sparks.

---

## What would actually move it

In order of impact, and none of them is a colour:

1. **Photography.** 6 of 82 is the single largest gap in the product. Every
   comparison app the owner named is photo-led. `PLACES_INGESTION_SCOPE.md`
   costs ~$0 at this volume and 5–8 days. **This is the one that matters.**
2. **Density.** Show many venues at once, edge to edge, as a browsable wall —
   not three cards on a calm ground.
3. **Content before configuration.** Let someone see Dubai before the app
   asks them anything.
4. **Real metallic and real contrast**, if Dubai is the brief — gold that
   reads as gold, deep black, high gloss. That is a different visual system
   from §24, not a tweak to it.
5. **Faces and presence.** §26.1's empty seats are the right instinct; they
   need people in them.

---

## The thing to resist

**Another palette round.** Nine have not worked. A tenth is the cheapest thing
to reach for and the least likely to help, and every one of them has cost
Frontend a re-implementation.

If the next session's instinct is "let me try different colours" — that
instinct has been tested nine times and falsified nine times.
