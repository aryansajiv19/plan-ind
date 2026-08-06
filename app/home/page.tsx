import AuthProfileBridge from "@/components/AuthProfileBridge";
import HomeExperience from "@/components/HomeExperience";
import { requireUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name;
  const fallbackName =
    (typeof metadataName === "string" && metadataName.trim()) ||
    user.email?.split("@")[0] ||
    "Friend";

  return (
    <>
      <AuthProfileBridge fallbackName={fallbackName} />
      <HomeExperience name={fallbackName} />
    </>
  );
}
