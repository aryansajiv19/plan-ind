"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import PhotoCredit, { CreditMark } from "@/components/PhotoCredit";
import { canOptimiseImage } from "@/lib/image-src";
import type { PlacePhoto } from "@/lib/places/photo";
import type { PhotoSpot } from "@/lib/venue-photo";

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
  className = "object-cover",
}: {
  spot: PhotoSpot;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  if (spot.photo_url) {
    return (
      <>
        <Image
          src={spot.photo_url}
          alt=""
          fill
          sizes={sizes}
          preload={preload}
          className={className}
          unoptimized={!canOptimiseImage(spot.photo_url)}
        />
        {/* Licence obligation, not decoration — see PhotoCredit. */}
        <PhotoCredit spot={spot} />
      </>
    );
  }
  return spot.google_place_id ? <GooglePhoto spotId={spot.id} className={className} /> : null;
}

function GooglePhoto({ spotId, className }: { spotId: string; className: string }) {
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
