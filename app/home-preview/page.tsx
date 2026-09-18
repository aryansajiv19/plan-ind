import { redirect } from "next/navigation";

// Kept as the old internal name. The demo lives at /demo now, because the URL
// is part of what a visitor reads and "home-preview" reads like a staging
// path. Every link and every line of copy points at /demo.
export default function HomePreviewPage() {
  redirect("/demo");
}
