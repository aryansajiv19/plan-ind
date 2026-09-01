// The 23 hangout categories, in the five groups the composer shows as tabs.
//
// The groups are STRUCTURE ONLY now — they order the composer's tabs and
// nothing else. They used to carry a hue each (`--color-group-*`, selected
// with `data-group`), and that whole category rainbow was retired by the
// owner's design handoff: brass carries structure, terracotta carries live
// state, and what kind of night it is comes from the photograph. Do not
// reintroduce a per-group colour.

export const CATEGORY_GROUPS = [
  {
    key: "food",
    label: "Food & drink",
    categories: [
      { key: "dinner", label: "Dinner", title: "Where should we eat?" },
      { key: "cafe", label: "Cafes", title: "Where for coffee?" },
      { key: "brunch", label: "Brunch", title: "Where's brunch?" },
      { key: "dessert", label: "Dessert", title: "Where for dessert?" },
      { key: "shisha", label: "Shisha", title: "Where for shisha?" },
    ],
  },
  {
    key: "night",
    label: "After dark",
    categories: [
      { key: "vibes", label: "Rooftops & lounges", title: "Where's the vibe?" },
      { key: "nightlife", label: "Nightlife", title: "Where are we going out?" },
      { key: "live_music", label: "Live music", title: "Where should we hear live music?" },
      { key: "karaoke", label: "Karaoke", title: "Where for karaoke?" },
    ],
  },
  {
    key: "water",
    label: "Sun & water",
    categories: [
      { key: "beach", label: "Beaches", title: "Which beach spot?" },
      { key: "beach_club", label: "Beach clubs", title: "Which beach club?" },
      { key: "water", label: "Water activities", title: "What should we do on the water?" },
    ],
  },
  {
    key: "active",
    label: "Move and play",
    categories: [
      { key: "sports", label: "Sports", title: "What's the sporting plan?" },
      { key: "padel", label: "Padel", title: "Where should we play padel?" },
      { key: "adventure", label: "Adventure", title: "What's the adrenaline plan?" },
      { key: "outdoors", label: "Outdoors", title: "What's the outdoor plan?" },
      { key: "games", label: "Games", title: "What are we playing?" },
    ],
  },
  {
    key: "leisure",
    label: "Culture & reset",
    categories: [
      { key: "movie", label: "Cinema", title: "What are we watching?" },
      { key: "culture", label: "Arts & culture", title: "What should we go see?" },
      { key: "wellness", label: "Wellness", title: "Where should we reset?" },
      { key: "shopping", label: "Shopping", title: "Where should we browse?" },
      { key: "family", label: "Family day", title: "What's the family plan?" },
      { key: "escape", label: "City escape", title: "Where should we escape to?" },
    ],
  },
] as const;

export type GroupKey = (typeof CATEGORY_GROUPS)[number]["key"];
export type Category = { key: string; label: string; title: string };

export const CATEGORIES: readonly Category[] = CATEGORY_GROUPS.flatMap((group) => [
  ...group.categories,
]);

const GROUP_OF: Record<string, GroupKey> = Object.fromEntries(
  CATEGORY_GROUPS.flatMap((group) => group.categories.map((c) => [c.key, group.key])),
);

/** Which of the five groups a category key belongs to. Unknown or custom
 *  categories fall back to "food": a plan always renders in some hue, and
 *  the group label is never the only thing on screen. */
export function categoryGroup(category: string | null | undefined): GroupKey {
  return (category && GROUP_OF[category]) || "food";
}
