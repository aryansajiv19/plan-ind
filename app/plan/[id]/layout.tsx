import type { Metadata } from "next";
import { fetchPlanSharePreview } from "@/lib/share-preview-server";
import { SITE_NAME, shareCopy } from "@/lib/share-preview";

// Server layout whose only job is the link preview. The page stays a client
// component; this adds nothing to its tree.
//
// generateMetadata cannot throw and cannot hang the page: fetchPlanSharePreview
// returns null for a malformed id (no DB call), an unknown/deleted plan, an
// unapplied migration 062 (PGRST202), a timeout or any error, and null renders
// the generic plan card. Browsers get this streamed after first paint;
// HTML-limited bots (WhatsApp, facebookexternalhit, Slackbot, ...) get it
// blocking in <head>, which is what they read.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const copy = shareCopy(await fetchPlanSharePreview(id));
  const title = `${copy.title} | ${SITE_NAME}`;
  // The unfurl's bold line: a decided plan leads with where the group is going.
  const cardTitle = copy.winner ? `We're going to ${copy.winner}` : copy.title;
  return {
    title,
    description: copy.description,
    // A plan is a private group's page: previewable by whoever holds the
    // link, never listed by a search engine.
    robots: { index: false, follow: false },
    // Restated whole: a child's openGraph replaces the parent's, it does not
    // merge. The image comes from ./opengraph-image.tsx.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_AE",
      title: cardTitle,
      description: copy.description,
    },
    twitter: { card: "summary_large_image", title: cardTitle, description: copy.description },
  };
}

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
