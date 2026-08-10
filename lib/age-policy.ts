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

export function safeAgeFromMetadata(metadata: Record<string, unknown> | undefined): number | null {
  const value = metadata?.date_of_birth;
  return typeof value === "string" ? ageOnDate(value) : null;
}
