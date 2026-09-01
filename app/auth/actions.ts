"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateBirthDate } from "@/lib/age-policy";
import { consumeOtpRequestLimit, recordSecurityEvent, requestId } from "@/lib/security/controls";
import { safeNextPath } from "@/lib/auth";

export interface AuthFormState {
  email?: string;
  dateOfBirth?: string;
  error?: string;
  message?: string;
  sent?: boolean;
}

function birthDateFrom(formData: FormData): { dateOfBirth: string; age: number } | { error: string } {
  return validateBirthDate(formData.get("dateOfBirth"));
}

async function appOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) return "http://localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

function cleanEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function requestEmailCode(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }
  const captchaTokenValue = formData.get("captchaToken");
  const captchaToken = typeof captchaTokenValue === "string" ? captchaTokenValue : "";
  if (process.env.NODE_ENV === "production" && !captchaToken) {
    return { error: "Complete the security check and try again." };
  }
  const next = safeNextPath(formData.get("next")?.toString());

  const supabase = await createClient();

  // Durable, per-address limit (migration 026) — Turnstile above only proves
  // "not a trivial bot", not "not spamming one address". No session exists
  // yet, so this can't reuse consume_app_quota.
  if (!(await consumeOtpRequestLimit(supabase, email))) {
    await recordSecurityEvent(supabase, {
      type: "rate_limit",
      outcome: "blocked",
      subject: email,
      requestId: await requestId(),
      metadata: { scope: "otp-request" },
    });
    return { email, error: "Too many codes requested for this address. Try again in a few minutes." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      captchaToken: captchaToken || undefined,
    },
  });

  await recordSecurityEvent(supabase, {
    type: "otp_request",
    outcome: error ? "failure" : "success",
    subject: email,
    requestId: await requestId(),
  });
  if (error) {
    // Deliberately match the success response so the form cannot disclose
    // whether an address already has an account.
    return {
      email,
      sent: true,
      message: "If that address can receive mail, a six-digit code is on its way.",
    };
  }

  return {
    email,
    sent: true,
    message: "If that address can receive mail, a six-digit code is on its way.",
  };
}

export async function verifyEmailCode(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";

  if (!email || !/^\d{6}$/.test(token)) {
    return { email, sent: true, error: "Enter the six-digit code from your email." };
  }
  const next = safeNextPath(formData.get("next")?.toString());

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  await recordSecurityEvent(supabase, {
    type: "otp_verify",
    outcome: error ? "failure" : "success",
    subject: email,
    requestId: await requestId(),
  });

  if (error) {
    return { email, sent: true, error: "That code is invalid or has expired." };
  }

  // /home sends anyone without a date of birth on file to /onboarding; any
  // other destination (e.g. back to the plan a guest was voting on) bypasses
  // that detour entirely — voting needs no date of birth.
  redirect(next);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next")?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

export async function saveBirthDate(_state: { error?: string }, formData: FormData) {
  const birth = birthDateFrom(formData);
  if ("error" in birth) return { error: birth.error };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // set_birth_date is write-once, so a second attempt is rejected by the
  // database rather than silently raising the account's age.
  const { error } = await supabase.rpc("set_birth_date", { p_date_of_birth: birth.dateOfBirth });
  if (error) {
    return { error: error.code === "42501"
      ? "Your date of birth is already saved. Contact us if it needs correcting."
      : "We couldn't save that yet. Please try again." };
  }
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
