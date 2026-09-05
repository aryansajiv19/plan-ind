import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceImport } from "@/lib/types";
import { SafeFetchError } from "./safe-fetch";
import { fetchOembedClues, type ExtractedClues } from "./oembed";
import { fetchWebClues } from "./web-adapter";
import { matchCandidates, type MatchCandidate, type CuratedSpotRow } from "./match";

// A score this far above the runner-up, with the top score also over
// RESOLVE_FLOOR, is confident enough to resolve automatically. Below that,
// real candidates go to the user as a pick-one list rather than a guess --
// the one hard rule from PLACE_IMPORT_ARCHITECTURE.md: never invent a match.
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
  const { data: curatedSpots } = await supabase.from("spots").select("id, name, cuisine, vibe, description").eq("source", "curated");

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
