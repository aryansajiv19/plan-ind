import type { Spot } from "@/lib/types";
import type { ExtractedClues } from "./oembed";

// Only what this module actually reads -- callers select just these
// columns (not select("*")), so the type should say that honestly rather
// than claim the full Spot shape.
export type CuratedSpotRow = Pick<Spot, "id" | "name" | "cuisine" | "vibe" | "description">;

export interface MatchCandidate {
  spot: CuratedSpotRow;
  score: number; // 0..1, normalized token overlap
}

// Catalog-only candidate matching -- no AI, no new Postgres extension.
// pg_trgm isn't installed on this project and isn't needed at this row
// count (curated spots stays ~100 rows, same sizing this codebase already
// leaned on for migration 027). Loading the whole curated set into memory
// and scoring in JS is the right-sized tool here; escalate only if the
// catalog genuinely grows past what this scales to.

const STOPWORDS = new Set(["the", "a", "an", "and", "at", "in", "of", "to", "for", "with", "dubai"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Combines the clue text into one bag of words -- title carries the most
// signal (it's usually the venue name or close to it), description is a
// weaker secondary signal.
function clueTokens(clues: ExtractedClues): Set<string> {
  const text = [clues.title, clues.description].filter(Boolean).join(" ");
  return tokenize(text);
}

export function matchCandidates(clues: ExtractedClues, curatedSpots: CuratedSpotRow[]): MatchCandidate[] {
  const clueSet = clueTokens(clues);
  if (clueSet.size === 0) return [];

  const scored = curatedSpots.map((spot) => {
    const spotText = [spot.name, spot.cuisine, spot.vibe, spot.description ?? ""].join(" ");
    // The venue name matching is the strongest possible signal -- weight it
    // heavily by scoring it against the full clue set on its own too, not
    // just as part of the combined bag.
    const nameScore = overlapScore(tokenize(spot.name), clueSet);
    const fullScore = overlapScore(tokenize(spotText), clueSet);
    return { spot, score: Math.max(nameScore, fullScore * 0.7) };
  });

  return scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
