import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateBirthDate } from "@/lib/age-policy";

function safeNextPath(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/home";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const pendingDob = request.cookies.get("deal-three-pending-dob")?.value;
      const birth = pendingDob ? validateBirthDate(pendingDob) : null;
      if (birth && !('error' in birth)) {
        // Write-once: a returning Google user already has a row, and the
        // rejection is the correct outcome, so the error is not surfaced.
        await supabase.rpc("set_birth_date", { p_date_of_birth: birth.dateOfBirth });
      }
      const response = NextResponse.redirect(new URL(next, request.url));
      response.cookies.delete("deal-three-pending-dob");
      return response;
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", request.url));
}
