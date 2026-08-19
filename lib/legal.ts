import "server-only";

export interface LegalConfig {
  operator: string;
  email: string;
  jurisdiction: string;
  isPlaceholder: boolean;
}

export function getLegalConfig(): LegalConfig {
  const operator = process.env.LEGAL_OPERATOR_NAME?.trim();
  const email = process.env.LEGAL_CONTACT_EMAIL?.trim();
  const jurisdiction = process.env.LEGAL_JURISDICTION?.trim();
  const missing = !operator || !email || !jurisdiction;

  if (missing && process.env.VERCEL_ENV === "production") {
    throw new Error(
      "LEGAL_OPERATOR_NAME, LEGAL_CONTACT_EMAIL, and LEGAL_JURISDICTION are required in production.",
    );
  }

  return {
    operator: operator || "Deal three (development)",
    email: email || "privacy@example.invalid",
    jurisdiction: jurisdiction || "Development environment",
    isPlaceholder: missing,
  };
}
