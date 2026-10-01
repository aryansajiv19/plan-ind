// The name a guest types, cleaned the way the server and database will clean
// it (plainText in lib/security/request.ts, then clean_display_name), so what
// the form accepts is what the plan will show. 2 to 30 characters.
export const GUEST_NAME_MIN = 2;
export const GUEST_NAME_MAX = 30;

export function cleanGuestName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GUEST_NAME_MAX)
    .trim();
}

export const validGuestName = (name: string) => name.length >= GUEST_NAME_MIN;
