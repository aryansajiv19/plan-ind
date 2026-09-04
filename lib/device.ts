// This device's memory. Two things live here, both localStorage-only and
// both safe to call during SSR (they no-op / return empty on the server):
//
//   1. the "been" list — spots this browser has already been dealt/decided
//   2. a cached profile — the person uuid + display name + avatar
//
// Supabase Auth is now the identity model. Existing local profiles are used
// only to seed the signed-in profile's display fields; their public UUID is
// never treated as proof of ownership. This file still never touches the
// network, and the cache keeps client-only social UI responsive.

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

// ─── The cached profile ────────────────────────────────────────────

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

/** This device's cached profile, or null if one has not been stored yet. */
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
 * Cache a server-authoritative profile after authentication. May replace an
 * old device-generated id, because Supabase Auth now owns identity.
 */
export function cacheMe(profile: DeviceProfile): void {
  if (typeof window === "undefined") return;
  if (!profile.id || !profile.display_name.trim()) return;
  localStorage.setItem(ME_KEY, JSON.stringify(profile));
}

/** Forget this device's identity. The server row (and its visits) survive. */
export function clearMe(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ME_KEY);
}
