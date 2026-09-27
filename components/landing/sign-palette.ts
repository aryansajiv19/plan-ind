// Experimental track: the sign street's shared vocabulary, used by the
// landing, the vote cards and the winner reveal so a place keeps its sign.

export type SignColour = "red" | "yellow" | "cobalt" | "white" | "green";
const COLOURS: readonly SignColour[] = ["red", "yellow", "cobalt", "white", "green"];

/** A place's sign colour, stable across screens (a hash of its id). */
export function signColourFor(id: string): SignColour {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

// Kufi category words, only where the Arabic is plain and certain; others
// carry the code alone rather than a guessed translation.
export const SIGN_ARABIC: Record<string, string> = {
  dinner: "عشاء", cafe: "مقهى", dessert: "حلويات", shisha: "شيشة", beach: "شاطئ", beach_club: "نادي شاطئ",
  sports: "رياضة", padel: "بادل", games: "ألعاب", movie: "سينما", culture: "ثقافة", karaoke: "كاريوكي",
  nightlife: "سهرة", vibes: "سهرة", family: "عائلة", shopping: "تسوق",
};
