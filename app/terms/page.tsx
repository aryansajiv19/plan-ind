import type { Metadata } from "next";
import Link from "next/link";
import { getLegalConfig } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms | Deal three" };

// This page has no dynamic API in its tree, so Next would otherwise
// prerender it once at build time — baking in whatever hour the build
// happened to run for autoGround()'s server-side theme stamp, corrected
// only after the fact by ThemeSync. SPECS.md §9.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const legal = getLegalConfig();
  return (
    <main className="legal-page">
      <Link href="/" className="legal-page__back">Deal three</Link>
      <article>
        <p className="home-section-kicker">Legal</p>
        <h1>Terms of service</h1>
        <p className="legal-page__date">Effective 19 August 2026</p>
        {legal.isPlaceholder && <p className="legal-page__notice">Development legal details are shown on this build.</p>}
        <h2>The service</h2>
        <p>Deal three helps groups shortlist places, vote, and coordinate an outing. Recommendations, venue details, availability, prices, and opening hours can change. Confirm important details with the venue before relying on them.</p>
        <h2>Your account and plans</h2>
        <p>You are responsible for activity through your account and for sharing plan links only with people you intend to invite. Do not misuse the service, probe its security, automate abusive traffic, or submit unlawful or harmful content.</p>
        <h2>Third-party services</h2>
        <p>The service may link to maps, calendars, venues, and other third parties. Their services and policies are separate from ours. Deal three does not process venue bookings or payments unless a checkout flow explicitly says otherwise.</p>
        <h2>Availability and liability</h2>
        <p>The service is provided as available. To the extent permitted by law, {legal.operator} is not liable for indirect losses, venue decisions, or plans made from inaccurate third-party information. Nothing here excludes rights that cannot legally be excluded.</p>
        <h2>Changes and contact</h2>
        <p>We may update these terms when the product or law changes. Material updates will carry a new effective date. These terms are governed by the laws applicable in {legal.jurisdiction}. Questions can be sent to <a href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
      </article>
      <Link href="/privacy">Read the privacy policy</Link>
    </main>
  );
}
