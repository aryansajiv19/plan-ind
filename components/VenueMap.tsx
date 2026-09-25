"use client";

import { useEffect, useRef, useState } from "react";
import { mapEmbedUrl, type MappableVenue } from "@/lib/directions";

// An in-app map, so the group can see where it is without leaving the page.
// Nothing loads until it is asked for: the placeholder swaps in the iframe
// when it scrolls near the viewport or "Show map" is tapped. A Google Maps
// embed is a whole second app, and most visits never scroll this far.
//
// The frame is locked down as far as the embed still works:
//   sandbox: scripts + same-origin (the map is a script app on its own
//     origin; both together are only an escape risk for a SAME-origin frame),
//     popups + escape (its "View larger map" opens a normal Maps tab). No
//     top-navigation, no forms, no downloads.
//   referrer: `strict-origin`, so Google sees the site, never the path.
//   CSP: proxy.ts allows frame-src https://www.google.com and nothing wider.

export default function VenueMap({ venue }: { venue: MappableVenue }) {
  // "asked" = the button was pressed or held focus: focus follows into the
  // map, so a keyboard user is not dropped onto <body> when it unmounts.
  const [shown, setShown] = useState<false | "seen" | "asked">(false);
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (shown === "asked") frame.current?.focus();
  }, [shown]);

  useEffect(() => {
    const el = holder.current;
    if (shown || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // Tabbing onto the button scrolls it in: carry that focus over too.
        setShown(el.contains(document.activeElement) ? "asked" : "seen");
      },
      { rootMargin: "0px 0px 160px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div ref={holder} className="mt-3 h-60 overflow-hidden rounded-xl border border-line bg-card sm:h-80">
      {shown ? (
        <iframe
          ref={frame}
          src={mapEmbedUrl(venue)}
          title={`Map of ${venue.name}, ${venue.area}`}
          loading="lazy"
          referrerPolicy="strict-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="block h-full w-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setShown("asked")} className="grid h-full w-full place-items-center text-sm font-medium text-ink underline underline-offset-4">
          Show map
        </button>
      )}
    </div>
  );
}
