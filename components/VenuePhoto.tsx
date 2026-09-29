"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CreditMark } from "@/components/PhotoCredit";
import CategoryArt from "@/components/CategoryArt";
import { canOptimiseImage } from "@/lib/image-src";
import type { PlacePhoto } from "@/lib/places/photo";
import type { PhotoSpot } from "@/lib/venue-photo";

// Google photos are billed per view, capped per day for the whole site, and
// may not be cached (terms). Signed-out surfaces (the landing, /demo) show
// our own photos only: a signed-out view used to spend 14-17 of the 300/day.
const GooglePhotos = createContext(true);
export function NoGooglePhotos({ children, off = true }: { children: ReactNode; off?: boolean }) {
  return <GooglePhotos.Provider value={!off}>{children}</GooglePhotos.Provider>;
}
/** Whether this surface may show Google photos; pass it to hasVenuePhoto. */
export function useGooglePhotos() {
  return useContext(GooglePhotos);
}

// One request per spot per page view, shared by every card that shows it. A
// refusal (signed out, quota, no photo) resolves null and is not retried.
const requests = new Map<string, Promise<PlacePhoto | null>>();
function googlePhoto(spotId: string): Promise<PlacePhoto | null> {
  let request = requests.get(spotId);
  if (!request) {
    request = fetch(`/api/spots/${spotId}/photo`)
      .then((response) => (response.ok ? (response.json() as Promise<PlacePhoto>) : null))
      .catch(() => null);
    requests.set(spotId, request);
  }
  return request;
}

/**
 * The venue's photo, filling its positioned parent. Our own licensed photo
 * first (optimised when it is ours); else the Google Places photo, fetched
 * once the card nears the viewport and loaded by the browser straight from
 * Google (the terms forbid our server caching it). Renders nothing without
 * either, so the card's own no-photo design shows.
 */
export default function VenuePhoto({
  spot,
  sizes,
  preload = false,
  fetchPriority,
  className = "object-cover",
}: {
  spot: PhotoSpot;
  sizes: string;
  preload?: boolean;
  /** "high" for the page's LCP image only. */
  fetchPriority?: "high";
  className?: string;
}) {
  const google = useGooglePhotos();
  if (spot.photo_url) {
    return (
      <>
        <Image
          src={spot.photo_url}
          alt=""
          fill
          sizes={sizes}
          preload={preload}
          fetchPriority={fetchPriority}
          className={className}
          unoptimized={!canOptimiseImage(spot.photo_url)}
        />
      </>
    );
  }
  if (google && spot.google_place_id) return <GooglePhoto spotId={spot.id} category={spot.category} className={className} />;
  // No photo to show: the category's scene, so the box is never empty.
  return spot.category ? <CategoryArt category={spot.category} /> : null;
}

function GooglePhoto({ spotId, category, className }: { spotId: string; category?: string; className: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void googlePhoto(spotId).then((result) => {
          if (live) setPhoto(result);
        });
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [spotId]);

  const authors = photo?.attributions.map((author) => author.displayName).filter(Boolean).join(", ");
  return (
    <span ref={anchor} className="venue-photo" data-ready={photo ? "" : undefined}>
      {/* The scene sits underneath: it shows while Google answers, and stays
          when Google has no photo or the quota is spent. */}
      {category && <CategoryArt category={category} />}
      {photo ? (
        <>
          {/* A plain img: the optimiser would store Google's image on our server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.photoUri}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            className={className}
            // A browser-cached answer can outlive Google's short-lived URL.
            onError={() => setPhoto(null)}
          />
          {/* Google's terms: show the photo's authors wherever it appears. */}
          <CreditMark text={`${authors ? `${authors} · ` : ""}Google Maps`} />
        </>
      ) : null}
    </span>
  );
}
