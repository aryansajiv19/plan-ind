"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  email?: string;
  error?: string;
  message?: string;
  sent?: boolean;
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
    sent: true,
    message: `We sent a six-digit code to ${email}.`,
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

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { email, sent: true, error: "That code is invalid or has expired." };
  }

  redirect("/home");
}

export async function signInWithGoogle() {
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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
