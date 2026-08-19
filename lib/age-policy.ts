import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_ACCOUNT_AGE = 13;

export const CATEGORY_MINIMUM_AGE: Record<string, number> = {
  shisha: 18,
  vibes: 21,
  nightlife: 21,
  beach_club: 21,
};

const PROHIBITED_VENUE_TERMS = [
  "strip club", "stripclub", "gentlemen's club", "adult entertainment",
  "adult-entertainment", "erotic massage", "escort service", "brothel",
  "sex club", "swingers club", "swinger club", "topless bar", "nude show",
];

export function ageOnDate(dateOfBirth: string, now = new Date()): number | null {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(birth.getTime())) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = now.getUTCMonth() > birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function validateBirthDate(value: unknown, now = new Date()): { dateOfBirth: string; age: number } | { error: string } {
  const dateOfBirth = typeof value === "string" ? value.trim() : "";
  const age = ageOnDate(dateOfBirth, now);
  if (age === null) return { error: "Enter a real date of birth." };
  if (age < MIN_ACCOUNT_AGE) return { error: `Deal three is for people ${MIN_ACCOUNT_AGE} and older.` };
  return { dateOfBirth, age };
}

export function minimumAgeForCategory(category: string): number {
  return CATEGORY_MINIMUM_AGE[category] ?? 0;
}

export function prohibitedVenueReason(...values: Array<string | null | undefined>): string | null {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  return PROHIBITED_VENUE_TERMS.find((term) => text.includes(term)) ?? null;
}

export function venueAllowedForAge(age: number, minimumAge: number | null | undefined): boolean {
  return age >= (minimumAge ?? 0);
}

/**
 * The account's age, read from the server-owned `member_ages` table.
 *
 * Never read date of birth from `auth` user_metadata: the browser can rewrite
 * that with `supabase.auth.updateUser({ data })`, so an age taken from it is
 * certified by the same account it is supposed to gate. `member_ages` has no
 * insert or update policy — the only write path is the `set_birth_date` RPC,
 * which refuses to overwrite an existing row.
 */
export async function memberAge(supabase: SupabaseClient, userId: string): Promise<number | null> {
  if (!userId) return null;
  const { data, error } = await supabase.rpc("current_member_age");
  if (!error && typeof data === "number") return data;

  // Compatibility while migration 020 is being applied. This branch can be
  // removed after every environment exposes current_member_age().
  const legacy = await supabase
    .from("member_ages")
    .select("date_of_birth")
    .eq("user_id", userId)
    .maybeSingle();
  const value = (legacy.data as { date_of_birth?: unknown } | null)?.date_of_birth;
  return typeof value === "string" ? ageOnDate(value) : null;
}
