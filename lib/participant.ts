const TOKEN_PREFIX = "deal-three:participant:";

function randomToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function participantTokenHash(planId: string): Promise<string> {
  const key = `${TOKEN_PREFIX}${planId}`;
  let token = localStorage.getItem(key);
  if (!token) {
    token = randomToken();
    localStorage.setItem(key, token);
  }
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
