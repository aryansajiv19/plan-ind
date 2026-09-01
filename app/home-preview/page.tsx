import { notFound } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";

// Dev-only, and stays that way: this is the one surface that renders
// DemoAccountViews, which is invented friends, visits and photos. The public
// front door is `/`, which shows the same hero with fixtures off.
export default function HomePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HomeExperience name="Aryan" demoMode fixtures />;
}
