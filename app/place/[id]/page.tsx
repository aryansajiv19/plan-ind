import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { categoryMeta } from "@/lib/categories";

// The venue detail page — SPECS.md §6, previously unbuilt (12a). Scoped down
// from the full original brief: this design system references a "four-source
// photo priority" and a Photos/360-tour/Your-friends/Menu tab row, but this
// schema has exactly one photo source (spots.photo_url) and no 360-tour,
// menu, or friend-photo data anywhere. Building those tabs empty would be a
// dead control (ui-implementation skill's non-negotiable #1); building them
// with invented content would be fabricated data. Both are out. What ships
// here is the real, honest version: hero, identity, the fields the schema
// actually has, and a real "open in Maps" link from lat/long — the free-tier
// piece of the venue-link-enrichment work PRIORITIES.md already scoped.
//
// Reachable without a session: curated spots have no auth condition in their
// RLS read policy (supabase/schema.sql "read spots"), matching how the rest
// of the app treats the curated catalogue as public.

// cache() dedupes this across generateMetadata and the page body — both run
// per request, and without this that's two identical Supabase round trips.
const getSpot = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("spots")
    .select(
      "id, name, category, area, cuisine, price_band, min_spend, open_till, vibe, photo_url, description, booking_url, address, latitude, longitude",
    )
    .eq("id", id)
    .maybeSingle();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const spot = await getSpot(id);
  return { title: spot ? `${spot.name} | Deal three` : "Place not found | Deal three" };
}

export default async function PlacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const spot = await getSpot(id);

  if (!spot) notFound();

  const cat = categoryMeta(spot.category);
  const hasPhoto = Boolean(spot.photo_url);
  const mapsHref =
    spot.latitude != null && spot.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`
      : spot.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.address)}`
        : null;

  return (
    <main className="place-page">
      <div className={`place-hero ${hasPhoto ? "" : "place-hero--typographic"}`}>
        {hasPhoto ? (
          <Image
            src={spot.photo_url as string}
            alt=""
            fill
            sizes="100vw"
            priority
            className="place-hero__img"
            // Same posture as PhotoTile: photo_url is unconstrained today and
            // next.config has no remotePatterns allowlist.
            unoptimized
          />
        ) : null}
        <div className="place-hero__scrim" aria-hidden="true" />
        <div className="place-hero__body">
          <p className="place-hero__category">{cat.code}</p>
          <h1 className="place-hero__name">{spot.name}</h1>
          <p className="place-hero__area">{spot.area}</p>
        </div>
      </div>

      <div className="place-content">
        <div className="place-meta">
          <span>{spot.price_band}</span>
          <span>From AED {spot.min_spend}pp</span>
          <span>Open till {spot.open_till}</span>
        </div>

        {(spot.description ?? spot.vibe) && (
          <p className="place-description">{spot.description ?? spot.vibe}</p>
        )}

        <div className="place-actions">
          {spot.booking_url && (
            <a
              href={spot.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="place-action"
            >
              Book a table
            </a>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="place-action place-action--secondary"
            >
              Open in Maps
            </a>
          )}
        </div>

        <Link href="/home" className="place-back">
          Back to Discover
        </Link>
      </div>
    </main>
  );
}
