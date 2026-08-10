"use server";

import { headers } from "next/headers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateBirthDate } from "@/lib/age-policy";

export interface AuthFormState {
  email?: string;
  dateOfBirth?: string;
  error?: string;
  message?: string;
  sent?: boolean;
}

const PENDING_BIRTH_DATE = "deal-three-pending-dob";
const otpRequests = new Map<string, { count: number; resetsAt: number }>();

function allowOtp(email: string): boolean {
  const now = Date.now();
  const current = otpRequests.get(email);
  if (!current || current.resetsAt <= now) {
    otpRequests.set(email, { count: 1, resetsAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 3) return false;
  current.count += 1;
  return true;
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
  const birth = birthDateFrom(formData);
  if ("error" in birth) return { email, dateOfBirth: String(formData.get("dateOfBirth") ?? ""), error: birth.error };
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }
  if (!allowOtp(email)) return { email, dateOfBirth: birth.dateOfBirth, error: "Too many codes requested. Try again in ten minutes." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=/home`,
    },
  });

  if (error) {
    return { email, error: "We couldn't send a code. Please try again." };
  }

  return {
    email,
    dateOfBirth: birth.dateOfBirth,
    sent: true,
    message: `We sent a six-digit code to ${email}.`,
  };
}

export async function verifyEmailCode(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "");
  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";

  if (!email || !/^\d{6}$/.test(token)) {
    return { email, dateOfBirth, sent: true, error: "Enter the six-digit code from your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { email, dateOfBirth, sent: true, error: "That code is invalid or has expired." };
  }

  const birth = validateBirthDate(dateOfBirth);
  if ("error" in birth) return { email, dateOfBirth, sent: true, error: birth.error };
  const { error: profileError } = await supabase.auth.updateUser({ data: { date_of_birth: birth.dateOfBirth } });
  if (profileError) redirect("/onboarding");

  redirect("/home");
}

export async function signInWithGoogle(formData: FormData) {
  const birth = birthDateFrom(formData);
  if ("error" in birth) redirect(`/login?error=age&message=${encodeURIComponent(birth.error)}`);
  const cookieStore = await cookies();
  cookieStore.set(PENDING_BIRTH_DATE, birth.dateOfBirth, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/",
  });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await appOrigin()}/auth/callback?next=/home`,
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
  const { error } = await supabase.auth.updateUser({ data: { date_of_birth: birth.dateOfBirth } });
  if (error) return { error: "We couldn't save that yet. Please try again." };
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
