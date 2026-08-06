import { notFound } from "next/navigation";
import HomeExperience from "@/components/HomeExperience";

export default function HomePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <HomeExperience name="Aryan" />;
}
