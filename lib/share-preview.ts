/**
 * What a shared plan link says about itself: the unfurl text for the
 * per-plan metadata and OG image, and the message the share buttons send.
 * Pure on purpose: the server fetch lives in share-preview-server.ts, and
 * ShareActions (client) imports only the message builders from here.
 *
 * Every string here may reach a sessionless link crawler, so it is built only
 * from PlanSharePreview (migration 062), never from a member-scoped read.
 */
import type { PlanSharePreview } from "./types";

// Any RFC 4122 layout. Checked before any DB call: a malformed id gets the
// generic card without spending a round trip (or a PostgREST 22P02).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlanId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

export const SITE_NAME = "Deal three";
export const GENERIC_PLAN_TITLE = "A Dubai plan to vote on";
const SIGN_IN_NOTE = "Sign in with Google or an email code in seconds.";
export const GENERIC_PLAN_DESCRIPTION =
  `Vote on 9 Dubai spots across three rounds of three, then let the app call it. ${SIGN_IN_NOTE}`;

/** Narrows an untyped RPC payload; anything off-shape is treated as absent. */
export function parseSharePreview(value: unknown): PlanSharePreview | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || !v.title.trim()) return null;
  if (v.status !== "open" && v.status !== "decided") return null;
  if (v.stage !== "pool" && v.stage !== "final" && v.stage !== "decided") return null;
  const spots = typeof v.spot_count === "number" && Number.isFinite(v.spot_count) ? v.spot_count : 0;
  return {
    title: v.title.trim().slice(0, 60),
    status: v.status,
    stage: v.stage,
    deadline: typeof v.deadline === "string" ? v.deadline : null,
    host_first_name: typeof v.host_first_name === "string" && v.host_first_name.trim()
      ? v.host_first_name.trim().slice(0, 24)
      : null,
    spot_count: Math.max(0, Math.floor(spots)),
  };
}

function deadlineLabel(deadline: string | null, now: number): string | null {
  if (!deadline) return null;
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now) return null;
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
  return `Voting closes ${when}`;
}

export interface ShareCopy {
  /** The plan's own title, or the generic one. */
  title: string;
  /** "Vote on 9 Dubai spots" / round state — the card's second line. */
  state: string;
  /** "Sara is hosting", or null when the host has no public first name. */
  host: string | null;
  /** Deadline line, only while it is still ahead. */
  closes: string | null;
  /** One sentence for og:description. */
  description: string;
}

export function shareCopy(preview: PlanSharePreview | null, now = Date.now()): ShareCopy {
  if (!preview) {
    return {
      title: GENERIC_PLAN_TITLE,
      state: "Vote on 9 Dubai spots",
      host: null,
      closes: null,
      description: GENERIC_PLAN_DESCRIPTION,
    };
  }
  const count = preview.spot_count > 0 ? preview.spot_count : 9;
  const decided = preview.status === "decided" || preview.stage === "decided";
  const state = decided
    ? "Decided: see where the group is going"
    : preview.stage === "final"
      ? "Final round: pick the winner"
      : `Vote on ${count} Dubai spots`;
  const host = preview.host_first_name ? `${preview.host_first_name} is hosting` : null;
  const closes = decided ? null : deadlineLabel(preview.deadline, now);
  const lead = preview.host_first_name ? `${preview.host_first_name} wants your vote.` : "Your vote is wanted.";
  const description = decided
    ? `${preview.host_first_name ? `${preview.host_first_name}'s` : "The"} group has picked a spot. Open the plan to see it.`
    // Voting needs an account now; say so before the tap, not after it.
    : [lead, `${state}.`, closes ? `${closes}.` : null, SIGN_IN_NOTE].filter(Boolean).join(" ");
  return { title: preview.title, state, host, closes, description };
}

/** The text the share buttons send: a line of context, then the link. */
export function shareMessage(title: string | null | undefined, url: string): string {
  const name = title?.trim();
  return name ? `Help pick where we go: "${name}"\n${url}` : `Help pick where we go\n${url}`;
}

export function whatsappShareUrl(title: string | null | undefined, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage(title, url))}`;
}
