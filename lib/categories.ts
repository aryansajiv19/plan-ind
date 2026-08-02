// Per-category visual identity for the place cards. A plan is always one
// category, so all three cards share an accent — it reads as identity, not a
// rainbow. Accents are muted jewel tones that sit with the grape/plum palette;
// Punch pink is deliberately NOT used here — it's reserved for the reveal.

export interface CategoryMeta {
  accent: string;
  glyph: string;
}

const META: Record<string, CategoryMeta> = {
  dinner: { accent: "#B0468C", glyph: "🍽️" },
  cafe: { accent: "#C98A4B", glyph: "☕" },
  brunch: { accent: "#E08A3C", glyph: "🥞" },
  dessert: { accent: "#D6608A", glyph: "🍰" },
  shisha: { accent: "#7A5BD6", glyph: "💨" },
  vibes: { accent: "#5B54D6", glyph: "✨" },
  beach: { accent: "#0FA6B8", glyph: "🏖️" },
  outdoors: { accent: "#3FA96A", glyph: "🌿" },
  movie: { accent: "#6B34E0", glyph: "🎬" },
  games: { accent: "#C79212", glyph: "🎮" },
  sports: { accent: "#1E9E6A", glyph: "⚽" },
  karaoke: { accent: "#9B4DCA", glyph: "🎤" },
};

const FALLBACK: CategoryMeta = { accent: "#6B34E0", glyph: "📍" };

export function categoryMeta(category: string): CategoryMeta {
  return META[category] ?? FALLBACK;
}
