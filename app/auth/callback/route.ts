import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { landingAfterSignIn, safeNextPath } from "@/lib/auth";
import { resolveAppOrigin } from "@/lib/app-origin";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  // The same origin the sign-in email was sent for -- see lib/app-origin.ts
  // for why this must not be request.url.
  const base = resolveAppOrigin({
    host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    forwardedProto: request.headers.get("x-forwarded-proto"),
  });

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    // A first-time account detours through /onboarding for its date of
    // birth, carrying `next` so a plan link still ends on the plan.
    if (!error && data.user) {
      return NextResponse.redirect(new URL(await landingAfterSignIn(supabase, data.user.id, next), base));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", base));
}
