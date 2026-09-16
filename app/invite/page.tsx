import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import InviteAccept from "@/components/InviteAccept";

// The token lives in the URL fragment, which browsers never send to a server
// or put in a Referer — no-referrer is the second belt on the same leak.
export const metadata: Metadata = {
  title: "Friend invite | Deal three",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function InvitePage() {
  const user = await getCurrentUser();
  let accountName: string | null = null;
  let profileFailed = false;
  if (user) {
    // The invite RPCs need a people row, and someone arriving straight from a
    // link may not have one yet. Idempotent, same as /home.
    const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
    const fallbackName =
      (typeof metadataName === "string" && metadataName.trim()) || user.email?.split("@")[0] || "Friend";
    const supabase = await createClient();
    const { error: ensureError } = await supabase.rpc("ensure_authenticated_profile", { p_display_name: fallbackName });
    // Read back the name this account shows as, so the accept button can say
    // who is accepting. A refused or missing row is a real error, not a
    // retry loop: redeem would refuse without it.
    const { data: me, error: readError } = await supabase.from("people").select("display_name").eq("id", user.id).maybeSingle();
    profileFailed = Boolean(ensureError || readError || !me);
    accountName = me?.display_name ?? null;
  }
  return <InviteAccept signedIn={Boolean(user)} accountName={accountName} profileFailed={profileFailed} />;
}
