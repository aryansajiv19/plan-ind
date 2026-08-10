// Faces for people who have no account.
//
// Participants on a shared plan link are anonymous — a typed name and nothing
// else. There is no photo to show and we must never invent one: a stock face
// attached to a real person's name is a fabricated identity, which is the one
// thing this codebase does not do.
//
// So an avatar is initials on a colour derived from the name itself. The same
// person is the same colour on every screen and in every browser, with nothing
// stored, because the colour is a pure function of the string.

/** Up to two initials. Falls back to "?" for an empty or symbol-only name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

/**
 * A stable hue for a name. Hue only — saturation and lightness are fixed so
 * every avatar sits at the same weight against the ivory and obsidian grounds
 * and no single person's colour shouts louder than another's.
 *
 * This is deliberately NOT the live accent or champagne. Those two carry
 * meaning ("you and now", "the outcome"); avatar colour identifies a person
 * and must not read as state.
 */
export function avatarHue(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360_000;
  }
  return hash % 360;
}

/** Inline style for an avatar chip. Kept here so the two callers cannot drift. */
export function avatarStyle(name: string): { background: string; color: string } {
  const hue = avatarHue(name);
  return {
    background: `oklch(0.86 0.045 ${hue})`,
    color: `oklch(0.34 0.06 ${hue})`,
  };
}
