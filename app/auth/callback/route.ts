import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth";
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Date of birth is collected at /onboarding, which /home redirects to
    // while it is missing — nothing to carry through the OAuth round trip.
    if (!error) return NextResponse.redirect(new URL(next, base));
  }

  return NextResponse.redirect(new URL("/login?error=callback", base));
}
