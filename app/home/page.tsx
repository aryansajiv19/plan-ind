import AuthProfileBridge from "@/components/AuthProfileBridge";
import HomeExperience from "@/components/HomeExperience";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { memberAge } from "@/lib/age-policy";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const user = await requireUser();
  const age = await memberAge(await createClient(), user.id);
  if (age === null) redirect("/onboarding");
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  const fallbackName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "Friend";

  return (
    <>
      <AuthProfileBridge fallbackName={fallbackName} />
      <HomeExperience name={fallbackName} age={age} />
    </>
  );
}
