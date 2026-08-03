// This device's memory. Two things live here, both localStorage-only and
// both safe to call during SSR (they no-op / return empty on the server):
//
//   1. the "been" list — spots this browser has already been dealt/decided
//   2. the device profile — the person uuid + display name + avatar
//
// The profile is the app's identity model: no auth, no passwords, no email.
// The browser mints a uuid once, keeps it here, and syncs the row to the
// `people` table (see lib/social.ts — this file never touches the network).
//
// Accepted tradeoffs: clearing browser storage or switching device loses the
// identity, and because the id is just a string in a public table, the model
// is impersonable by design. `people.auth_user_id` is the upgrade seam.

import type { PersonCard } from "./types";

const BEEN_KEY = "plan-ind:been";
const ME_KEY = "plan-ind:me";

// ─── The "been" list (unchanged behaviour) ─────────────────────────
// Used to bias new plans toward spots you haven't done yet.

export function getBeen(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addBeen(spotId: string | null): void {
  if (typeof window === "undefined" || !spotId) return;
  const set = new Set(getBeen());
  if (set.has(spotId)) return;
  set.add(spotId);
  localStorage.setItem(BEEN_KEY, JSON.stringify([...set]));
}

// ─── The device profile ────────────────────────────────────────────

// Exactly the public shape of a `people` row. Kept as an alias so the two
// can't drift: what we store locally is what we sync up.
export type DeviceProfile = PersonCard;

/** The app palette, so a generated avatar looks like it belongs. */
const AVATAR_COLORS = ["#6b34e0", "#ff2e88", "#ffce2e", "#17c79a"] as const;
const AVATAR_EMOJI = [
  "🍜",
  "🌮",
  "🍕",
  "🧋",
  "🍰",
  "🔥",
  "✨",
  "🦩",
  "🐙",
  "🌴",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** A playful default avatar. Callers are free to ignore it and pass their own. */
export function randomAvatar(): { emoji: string; color: string } {
  return { emoji: pick(AVATAR_EMOJI), color: pick(AVATAR_COLORS) };
}

/** uuid v4, with fallbacks for non-secure contexts where randomUUID is absent. */
export function newPersonId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort: Math.random, which is NOT cryptographically random. Reached
  // only in a non-secure context where `crypto` is absent entirely.
  //
  // ⚠ THIS IS ONLY ACCEPTABLE WHILE PERSON IDS ARE NOT SECRETS. Today
  // `select * from people` and `select * from visits` are both unrestricted,
  // so every id is bulk-readable anyway and guessing one buys nothing.
  //
  // If the profile link is ever made a real capability — i.e. if the audit's
  // H1 is fixed and reads become scoped to "you have the link" — this
  // fallback becomes the weak link: Math.random is predictable, so a
  // guessable id would hand out the capability. Make it a hard failure
  // (return null / throw and refuse to create a profile) at that point.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** This device's profile, or null if the user hasn't set one up yet. */
export function getMe(): DeviceProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ME_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<DeviceProfile>;
    // Anything missing an id or name is treated as absent rather than
    // half-valid, so callers never have to defend against a partial profile.
    if (!p?.id || !p?.display_name) return null;
    const fallback = randomAvatar();
    return {
      id: p.id,
      display_name: p.display_name,
      emoji: p.emoji || fallback.emoji,
      color: p.color || fallback.color,
    };
  } catch {
    return null;
  }
}

/**
 * Create or update this device's profile and return the full result.
 * The id is minted on first save and never changes afterwards — passing a
 * different one is ignored, because it's the person's stable identity.
 * Sync the return value to the server with upsertMe() in lib/social.ts.
 */
export function saveMe(
  patch: { display_name?: string; emoji?: string; color?: string },
): DeviceProfile | null {
  if (typeof window === "undefined") return null;
  const existing = getMe();
  const fallback = randomAvatar();
  const next: DeviceProfile = {
    id: existing?.id ?? newPersonId(),
    display_name: (
      patch.display_name ??
      existing?.display_name ??
      ""
    ).trim(),
    emoji: patch.emoji ?? existing?.emoji ?? fallback.emoji,
    color: patch.color ?? existing?.color ?? fallback.color,
  };
  if (!next.display_name) return existing; // a nameless profile is not a profile
  localStorage.setItem(ME_KEY, JSON.stringify(next));
  return next;
}

/** Forget this device's identity. The server row (and its visits) survive. */
export function clearMe(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ME_KEY);
}
