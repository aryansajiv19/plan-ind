// Per-category short codes for the place cards — DIN, PDL, CIN. A plan is
// always one category, so the code reads as identity without adding an icon
// set or an emoji.
//
// This used to also carry a per-category `accent` colour: 23 saturated jewel
// tones chosen, per the old comment, "to sit with the grape/plum palette".
// Two things were wrong with it. That palette no longer exists — the product
// is architectural ivory, graphite and champagne — and more to the point
// nothing ever rendered the field. All three call sites (OptionCard,
// DecidedPlan, AccountViews) read only `code`; the category strip takes its
// colour from `--vote-metal` in CSS. The accents were dead values drifting
// out of sync with every palette change, so they are gone rather than
// re-tuned. Per-category colour, if it is ever wanted, should be added
// deliberately and rendered.

export interface CategoryMeta {
  code: string;
}

const META: Record<string, CategoryMeta> = {
  dinner: { code: "DIN" },
  cafe: { code: "CAF" },
  brunch: { code: "BRN" },
  dessert: { code: "DES" },
  shisha: { code: "SHI" },
  vibes: { code: "LNG" },
  nightlife: { code: "NGT" },
  live_music: { code: "LIV" },
  karaoke: { code: "KAR" },
  beach: { code: "BCH" },
  beach_club: { code: "CLB" },
  water: { code: "WTR" },
  outdoors: { code: "OUT" },
  sports: { code: "SPT" },
  padel: { code: "PDL" },
  adventure: { code: "ADV" },
  games: { code: "GME" },
  movie: { code: "CIN" },
  culture: { code: "ART" },
  wellness: { code: "WEL" },
  shopping: { code: "SHP" },
  family: { code: "FAM" },
  escape: { code: "ESC" },
};

const FALLBACK: CategoryMeta = { code: "PLN" };

export function categoryMeta(category: string): CategoryMeta {
  return META[category] ?? FALLBACK;
}

// The category strings are DB enum values (snake_case); most read fine as-is
// ("beach", "brunch") but the few with an underscore ("beach_club",
// "live_music") rendered raw in the Discover filter pills and place-card
// meta line. One-line fix, not a label dictionary -- nothing here needs a
// different word, just a space where the underscore is.
export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}
