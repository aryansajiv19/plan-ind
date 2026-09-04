import type { Metadata } from "next";
import Link from "next/link";
import { getLegalConfig } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy | Deal three" };

// This page has no dynamic API in its tree, so Next would otherwise
// prerender it once at build time — baking in whatever hour the build
// happened to run for autoGround()'s server-side theme stamp, corrected
// only after the fact by ThemeSync. SPECS.md §9.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const legal = getLegalConfig();
  return (
    <main className="legal-page">
      <Link href="/" className="legal-page__back">Deal three</Link>
      <article>
        <p className="home-section-kicker">Legal</p>
        <h1>Privacy policy</h1>
        <p className="legal-page__date">Effective 19 August 2026</p>
        {legal.isPlaceholder && <p className="legal-page__notice">Development legal details are shown on this build.</p>}
        <h2>What we collect</h2>
        <p>We process account identifiers, profile details you provide, date of birth for age eligibility, plan content, votes, RSVP choices, ratings, and limited security and usage records. Shared-plan guests receive an anonymous session; their typed name and plan activity are visible to other members of that plan.</p>
        <h2>Why we use it</h2>
        <p>We use data to provide and secure the service, enforce age and usage limits, maintain plan history, troubleshoot failures, and prevent abuse. Smart-search text is sent to our AI provider to interpret your request; do not include secrets or sensitive personal information.</p>
        <h2>Sharing and retention</h2>
        <p>We use service providers for hosting, authentication, database storage, bot protection, and AI search. We do not sell personal data. We retain account and plan data while needed to provide the service, and retain minimized security records for a limited operational period.</p>
        <h2>Your choices</h2>
        <p>You can avoid optional profile information and can request access, correction, or deletion where applicable. Some records may be retained when required for security, legal obligations, or dispute handling.</p>
        <h2>Contact</h2>
        <p>{legal.operator} is responsible for this service in {legal.jurisdiction}. Send privacy requests to <a href={`mailto:${legal.email}`}>{legal.email}</a>.</p>
      </article>
      <Link href="/terms">Read the terms of service</Link>
    </main>
  );
}
