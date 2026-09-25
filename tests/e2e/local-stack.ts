import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFixture } from "./fixture";

// Everything the E2E suite does with the LOCAL stack's admin powers lives
// here, behind one loopback check.
//
// The key below is the Supabase CLI's well-known local demo service_role key:
// identical on every machine that runs `supabase start`, published in
// Supabase's docs, and meaningless against a hosted project. It is still an
// admin key, so nothing in this file will use it unless
// NEXT_PUBLIC_SUPABASE_URL is loopback.
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/;

export function isLocalStack(url: string | undefined): url is string {
  return !!url && LOOPBACK.test(url);
}

/** The local stack's URL, or a throw. Never returns a hosted URL. */
export function localStackUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!isLocalStack(url)) {
    throw new Error(`Refusing to use the local admin key against ${url ?? "(unset)"}: not a loopback URL.`);
  }
  return url;
}

export function localAdmin(): SupabaseClient {
  return createClient(localStackUrl(), LOCAL_SERVICE_KEY, { auth: { persistSession: false } });
}

// Test accounts carry the run id in their address so teardown removes this
// run's accounts and nobody else's.
export const E2E_EMAIL_DOMAIN = "e2e.plan-ind.test";
export const emailPrefixFor = (runId: string) => `e2e-${runId}-`;

function currentRunId(): string {
  const { runId } = readFixture();
  if (!runId) throw new Error("No runId in the E2E fixture file; global-setup did not provision this run.");
  return runId;
}

export interface Member {
  userId: string;
  email: string;
  name: string;
}

/**
 * A PERMANENT account, signed in inside `context`, the way a friend who
 * tapped the share link and finished sign-in would be.
 *
 * Plans need a real account (owner decision 2026-09-25): proxy.ts sends a
 * signed-out visitor to /login and migration 064 refuses anonymous sessions
 * in every participant RPC and policy. Driving the email OTP or Google in a
 * browser is not automatable in a production build (Turnstile), so the
 * account is created with the local admin API and its session is injected.
 *
 * The injection is not a hand-rolled cookie: the session is written through
 * @supabase/ssr's own createServerClient into a capturing jar, so the cookie
 * name, base64 encoding and chunking are whatever the app's version of the
 * library writes, and the proxy's getClaims() validates it like any other.
 *
 * The account has what a real first sign-in leaves behind: a people row with
 * a display name (the vote screen greets the voter with it) and a birthday
 * in member_ages (what /onboarding collects), so no screen detours.
 */
export async function signInAsMember(context: BrowserContext, baseURL: string, name: string): Promise<Member> {
  const url = localStackUrl();
  const admin = localAdmin();
  const email = `${emailPrefixFor(currentRunId())}${randomUUID().slice(0, 8)}@${E2E_EMAIL_DOMAIN}`;
  const password = randomBytes(18).toString("base64url");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (createError || !created.user) throw new Error(`creating ${email} failed: ${createError?.message}`);
  const userId = created.user.id;

  const { error: profileError } = await admin.from("people")
    .insert({ id: userId, display_name: name, auth_user_id: userId });
  if (profileError) throw new Error(`profile for ${email} failed: ${profileError.message}`);
  const { error: ageError } = await admin.from("member_ages")
    .insert({ user_id: userId, date_of_birth: "1990-01-01" });
  if (ageError) throw new Error(`birthday for ${email} failed: ${ageError.message}`);

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? LOCAL_ANON_KEY;
  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) throw new Error(`signing in ${email} failed: ${signInError?.message}`);
  if (signedIn.user.is_anonymous) throw new Error(`${email} came back anonymous; the gate would refuse it`);

  const jar = new Map<string, string>();
  const cookieClient = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([n, value]) => ({ name: n, value })),
      setAll: (toSet) => { for (const c of toSet) jar.set(c.name, c.value); },
    },
  });
  const { error: setError } = await cookieClient.auth.setSession({
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  });
  if (setError) throw new Error(`deriving the session cookie for ${email} failed: ${setError.message}`);
  if (jar.size === 0) throw new Error(`@supabase/ssr wrote no session cookie for ${email}`);

  await context.addCookies([...jar].map(([cookieName, value]) => ({
    name: cookieName, value, url: baseURL, sameSite: "Lax" as const,
  })));
  return { userId, email, name };
}

/** Removes every account this run created. Best-effort; returns how many went. */
export async function deleteRunMembers(runId: string): Promise<number> {
  const admin = localAdmin();
  const prefix = emailPrefixFor(runId);
  let removed = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users failed: ${error.message}`);
    const mine = data.users.filter((u) => u.email?.startsWith(prefix) && u.email.endsWith(`@${E2E_EMAIL_DOMAIN}`));
    for (const user of mine) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (!deleteError) removed++;
    }
    if (data.users.length < 1000) return removed;
  }
}
