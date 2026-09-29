import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import WentHere from "@/components/ranking/WentHere";
import { createClient } from "@/lib/supabase/server";
import VenuePhoto from "@/components/VenuePhoto";
import { hasVenuePhoto } from "@/lib/venue-photo";
import { categoryMeta } from "@/lib/categories";
import { knownMinSpend, knownPriceBand } from "@/lib/price";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import PlaceDirectPlanCta from "@/components/PlaceDirectPlanCta";
import GetThere from "@/components/GetThere";
import { metroLine } from "@/lib/dubai-metro";
import KnowBeforeYouGo from "@/components/KnowBeforeYouGo";
import { FACT_COLUMNS, reopensLabel } from "@/lib/venue-facts";
import PlaceSaveToBoard from "@/components/account/PlaceSaveToBoard";
import OpenStatus from "@/components/OpenStatus";
import DubaiMiniMap from "@/components/map/DubaiMiniMap";
import { googleMapsUrl } from "@/lib/directions";

// The venue detail page — SPECS.md §6, previously unbuilt (12a). Scoped down
// from the full original brief: this design system references a "four-source
// photo priority" and a Photos/360-tour/Your-friends/Menu tab row, but this
// schema has one photo per venue (ours, else Google's) and no 360-tour,
// menu, or friend-photo data anywhere. Building those tabs empty would be a
// dead control (ui-implementation skill's non-negotiable #1); building them
// with invented content would be fabricated data. Both are out. What ships
// here is the real, honest version: hero, identity, the fields the schema
// actually has, and a real "open in Maps" link from lat/long — the free-tier
// piece of the venue-link-enrichment work docs/archive/PRIORITIES-2026-09-18.md already scoped.
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
      `id, name, category, area, cuisine, price_band, min_spend, source, open_till, vibe, photo_url, photo_attribution, description, booking_url, address, latitude, longitude, google_place_id, minimum_age, nearest_station, station_line, station_walk_min, reopens_on, ${FACT_COLUMNS}`,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const rawFrom = (await searchParams).from;
  const from = rawFrom ? safeNextPath(rawFrom) : null; // internal paths only
  const [spot, user] = await Promise.all([getSpot(id), getCurrentUser()]);

  if (!spot) notFound();

  const cat = categoryMeta(spot.category);
  const hasPhoto = hasVenuePhoto(spot);
  const reopens = reopensLabel(spot.reopens_on); // 070: closed until a date

  return (
    <>
    <LandingNav signedIn={Boolean(user)} />
    <main className="place-page">
      <div className={`place-hero ${hasPhoto ? "" : "place-hero--typographic"}`} data-code={cat.code}>
        <VenuePhoto spot={spot} sizes="100vw" preload className="place-hero__img" />
        <div className="place-hero__scrim" aria-hidden="true" />
        {/* The code is a chip in the band's corner, as on the vote card: not a
            label stacked over the name. */}
        <p className="place-hero__category">{cat.code}</p>
        <div className="place-hero__body">
          <h1 className="place-hero__name">{spot.name}</h1>
          <p className="place-hero__area">{spot.area}</p>
        </div>
      </div>

      <div className="place-content">
        <div className="place-meta">
          {knownPriceBand(spot) && <span>{spot.price_band}</span>}
          {knownMinSpend(spot) != null && <span>From AED {spot.min_spend}pp</span>}
          <OpenStatus openTill={spot.open_till} />
          {reopens && <span>{reopens}</span>}
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
              className="place-action place-action--secondary"
            >
              Book a table
            </a>
          )}
          <a
            href={googleMapsUrl(spot)}
            target="_blank"
            rel="noopener noreferrer"
            className="place-action place-action--secondary"
          >
            Open in Google Maps
          </a>
        </div>
        <GetThere venue={spot} />
        {metroLine(spot) && <p className="place-metro">{metroLine(spot)}</p>}
        <KnowBeforeYouGo spot={spot} className="mt-8" />

        {/* The in-app map sits under the deep links, which stay the primary
            way to get there. It loads only when scrolled to or asked for. */}
        <section className="mt-8" aria-labelledby="place-where">
          <h2 id="place-where" className="place-subhead">Where</h2>
          <p className="mt-1 text-sm">{spot.address ?? `${spot.area}, Dubai`}</p>
          <DubaiMiniMap venue={spot} />
        </section>

        {/* SPECS.md §10.1: the direct-plan entry point. Signed-in only —
            create_direct_plan rejects a signed-out/anonymous caller
            server-side either way, but showing the CTA to someone who can't
            use it would mean building a whole form that fails at the end
            rather than not showing it. */}
        <div className="mt-6 grid justify-items-start gap-3">
          {user && (
            <PlaceDirectPlanCta
              spot={{ id: spot.id, name: spot.name, area: spot.area, category: spot.category }}
            />
          )}
          {user && <PlaceSaveToBoard spot={spot} />}
          {user && (
            <WentHere place={{ id: spot.id, name: spot.name, area: spot.area, category: spot.category, photo_url: spot.photo_url, photo_attribution: spot.photo_attribution, google_place_id: spot.google_place_id }} />
          )}
          {/* P9: signed out, planning starts with an account; come back here after. */}
          {!user && (
            <Link href={`/login?next=/place/${spot.id}`} className="place-action">
              Plan a night here
            </Link>
          )}
        </div>

        {/* P9: back to where the card was (a plan passes ?from=), else Discover
            signed in or the front door signed out. */}
        <Link href={from ?? (user ? "/home?view=discover" : "/")} className="place-back">Back</Link>
      </div>
    </main>
    </>
  );
}
