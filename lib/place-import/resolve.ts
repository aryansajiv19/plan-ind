import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceImport } from "@/lib/types";
import { SafeFetchError } from "./safe-fetch";
import { fetchOembedClues, type ExtractedClues } from "./oembed";
import { fetchWebClues } from "./web-adapter";
import { matchCandidates, type MatchCandidate, type CuratedSpotRow } from "./match";
import { fetchAllRows } from "@/lib/supabase/paginate";

// A score this far above the runner-up, with the top score also over
// RESOLVE_FLOOR, is confident enough to resolve automatically. Below that,
// real candidates go to the user as a pick-one list rather than a guess --
// the one hard rule from PLACE_IMPORT_ARCHITECTURE.md: never invent a match.
//
// These two survived the switch from min() to F1 scoring (match.ts), but
// they were re-derived against F1's distribution rather than assumed to
// carry over -- a threshold tuned to one scoring function means nothing
// under another. Swept against the real 82-row catalog, scoring every
// spot's own name as a title and a set of deliberately unrelated titles:
//
//   floor  margin 0.05 / 0.10 / 0.15      margin 0.20
//   0.50   82/82, 1 false positive        80/82
//   0.60   82/82, 0 false positives       80/82
//   0.65   82/82, 0 false positives       80/82
//   0.70   60/82  (collapses)             60/82
//
// 0.6/0.15 sits inside the safe plateau: 0.7 starts rejecting real exact
// matches, 0.5 lets an unrelated title through, and 0.2 costs two genuine
// self-matches. Of the margins that hold 82/82 with no false positives,
// 0.15 is the most conservative -- it demands the largest gap before
// resolving on its own -- so it is the one to keep.
const RESOLVE_FLOOR = 0.6;
const RESOLVE_MARGIN = 0.15;
const MAX_CANDIDATES_SHOWN = 3;

type ResolveOutcome =
  | { status: "resolved"; resolvedSpotId: string; extractedData: Record<string, unknown> }
  | { status: "needs_input"; extractedData: Record<string, unknown> }
  | { status: "failed"; errorCode: string; extractedData: Record<string, unknown> };

// Stored in extracted_data as-is -- title/description/author are untrusted
// text scraped from the source (real risk for the `web` adapter, whose
// target host is user-chosen). Fine to persist raw, since jsonb is just
// data here, not executed. NOT fine to render raw: whoever builds the "show
// why it matched" UI (PLACE_IMPORT_ARCHITECTURE.md step 7) must run this
// through the same plainText()-style treatment as any other attacker-
// supplied display text before it reaches a screen -- it has none applied
// at write time.
function summarizeClues(clues: ExtractedClues | null): Record<string, unknown> {
  if (!clues) return {};
  return {
    title: clues.title,
    author: clues.author,
    description: clues.description,
    thumbnailUrl: clues.thumbnailUrl,
  };
}

function summarizeCandidates(candidates: MatchCandidate[]): Array<{ spotId: string; name: string; score: number }> {
  return candidates.slice(0, MAX_CANDIDATES_SHOWN).map((c) => ({
    spotId: c.spot.id,
    name: c.spot.name,
    score: Math.round(c.score * 100) / 100,
  }));
}

async function resolveOutcome(
  provider: PlaceImport["provider"],
  normalizedUrl: string,
  curatedSpots: CuratedSpotRow[],
): Promise<ResolveOutcome> {
  if (provider === "instagram" || provider === "facebook") {
    // No credentials for either exist in this project -- their oEmbed/Graph
    // APIs have required an approved app since ~2018-2020. Honest
    // needs_input, not a silent failure pretending to have looked.
    return { status: "needs_input", extractedData: { reason: "unsupported_provider" } };
  }

  let clues: ExtractedClues;
  try {
    clues = provider === "web" ? await fetchWebClues(normalizedUrl) : await fetchOembedClues(provider, normalizedUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return { status: "needs_input", extractedData: { reason: "fetch_failed", detail: error.message } };
    }
    return { status: "failed", errorCode: "extract_error", extractedData: {} };
  }

  if (!clues.title && !clues.description) {
    return { status: "needs_input", extractedData: { reason: "no_clues", clues: summarizeClues(clues) } };
  }

  const candidates = matchCandidates(clues, curatedSpots);
  if (candidates.length === 0) {
    return { status: "needs_input", extractedData: { reason: "no_match", clues: summarizeClues(clues) } };
  }

  const [top, runnerUp] = candidates;
  const decisive = top.score >= RESOLVE_FLOOR && (!runnerUp || top.score - runnerUp.score >= RESOLVE_MARGIN);
  if (decisive) {
    return {
      status: "resolved",
      resolvedSpotId: top.spot.id,
      extractedData: { clues: summarizeClues(clues), matchScore: Math.round(top.score * 100) / 100 },
    };
  }
  return {
    status: "needs_input",
    extractedData: { reason: "ambiguous_match", clues: summarizeClues(clues), candidates: summarizeCandidates(candidates) },
  };
}

// Orchestrates one pending place_imports row through the resolution
// pipeline and persists the outcome. Runs synchronously inside the POST
// handler -- deliberate, not an oversight: no queue/background-job infra
// exists in this app yet (nothing needs one today), and every adapter call
// is bounded (5s timeout, capped response size), so the worst case adds
// ~5s to a save-link request. Upgrade path if that ever becomes a real
// complaint: move this behind a job, not before.
export async function resolvePlaceImport(
  supabase: SupabaseClient,
  importRow: { id: string; provider: PlaceImport["provider"]; normalizedUrl: string },
): Promise<void> {
  // match.ts only ever reads id/name/cuisine/vibe/description from these
  // rows -- narrowed from select("*") per the production-readiness pass
  // (migration 022's own comment flagged this, especially ahead of any
  // future embedding column on spots).
  // Paged, because PostgREST silently caps a table read at 1000 rows: past
  // that this matched a pasted link against only the first 1000 curated
  // spots and reported "no match" for venues that ARE in the catalogue
  // (measured at 5082 rows -- 1000 came back, no error). A correctness bug,
  // not a slow query.
  //
  // This still transfers every curated row per import and scores them all in
  // JS -- O(n) both ways. That is deliberate for now: the F1 scoring in
  // match.ts is the part that was just fixed and tested (82/82 self-resolve,
  // 0/6 false positives), and reimplementing it in SQL would trade tested
  // semantics for speed we have not yet shown we need. The right next step,
  // when the instruments say imports are hot, is to narrow candidates in
  // Postgres with the trigram index from migration 040 (word_similarity)
  // and keep the exact F1 scoring here over ~50 rows instead of 5000.
  const curatedSpots = await fetchAllRows<CuratedSpotRow>((from, to) =>
    supabase.from("spots").select("id, name, cuisine, vibe, description")
      .eq("source", "curated").order("id").range(from, to) as never,
  );

  let outcome: ResolveOutcome;
  try {
    outcome = await resolveOutcome(importRow.provider, importRow.normalizedUrl, (curatedSpots ?? []) as CuratedSpotRow[]);
  } catch {
    outcome = { status: "failed", errorCode: "unexpected_error", extractedData: {} };
  }

  const patch: Record<string, unknown> = {
    status: outcome.status,
    extracted_data: outcome.extractedData,
    updated_at: new Date().toISOString(),
  };
  if (outcome.status === "resolved") patch.resolved_spot_id = outcome.resolvedSpotId;
  if (outcome.status === "failed") patch.error_code = outcome.errorCode;

  await supabase.from("place_imports").update(patch).eq("id", importRow.id);
}
