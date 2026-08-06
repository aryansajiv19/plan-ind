// Per-category visual identity for the place cards. A plan is always one
// category, so all three cards share an accent — it reads as identity, not a
// rainbow. Accents are muted jewel tones that sit with the grape/plum palette;
// Punch pink is deliberately NOT used here — it's reserved for the reveal.

export interface CategoryMeta {
  accent: string;
  code: string;
}

const META: Record<string, CategoryMeta> = {
  dinner: { accent: "#B0468C", code: "DIN" },
  cafe: { accent: "#C98A4B", code: "CAF" },
  brunch: { accent: "#E08A3C", code: "BRN" },
  dessert: { accent: "#D6608A", code: "DES" },
  shisha: { accent: "#7A5BD6", code: "SHI" },
  vibes: { accent: "#5B54D6", code: "LNG" },
  nightlife: { accent: "#59406F", code: "NGT" },
  live_music: { accent: "#8C4B68", code: "LIV" },
  beach: { accent: "#0FA6B8", code: "BCH" },
  beach_club: { accent: "#217D95", code: "CLB" },
  water: { accent: "#237BAA", code: "WTR" },
  outdoors: { accent: "#3FA96A", code: "OUT" },
  sports: { accent: "#1E9E6A", code: "SPT" },
  padel: { accent: "#448B60", code: "PDL" },
  adventure: { accent: "#A45E32", code: "ADV" },
  games: { accent: "#C79212", code: "GME" },
  movie: { accent: "#6B34E0", code: "CIN" },
  culture: { accent: "#8A5547", code: "ART" },
  wellness: { accent: "#4B8379", code: "WEL" },
  shopping: { accent: "#7A607F", code: "SHP" },
  family: { accent: "#4E7699", code: "FAM" },
  escape: { accent: "#796342", code: "ESC" },
  karaoke: { accent: "#9B4DCA", code: "KAR" },
};

const FALLBACK: CategoryMeta = { accent: "#6B34E0", code: "PLN" };

export function categoryMeta(category: string): CategoryMeta {
  return META[category] ?? FALLBACK;
}
