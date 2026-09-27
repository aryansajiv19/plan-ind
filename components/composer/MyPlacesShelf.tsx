"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PlaceRow, { type RowCard } from "@/components/composer/PlaceRow";
import { minimumAgeForCategory } from "@/lib/age-policy";
import type { Composer } from "@/hooks/use-composer";

type Shelved = RowCard & { kind: "custom" | "collected" };

// The demo's shelf: invented, and labelled as sample in its title.
const SAMPLE: Shelved[] = [
  { id: "sample-majlis", name: "Grandma’s majlis", area: "Al Barsha", category: "dinner", photo_url: null, photo_attribution: null, kind: "custom" },
  { id: "sample-camp", name: "Our desert camp spot", area: "Al Qudra", category: "outdoors", photo_url: null, photo_attribution: null, kind: "custom" },
  { id: "sample-rooftop", name: "Office rooftop", area: "DIFC", category: "vibes", photo_url: null, photo_attribution: null, kind: "custom" },
];

// Places saved from links (the importer) that resolved to a real place: one
// small read of the route the Discover importer already uses. Its photos
// come without their licence credit, so these show the typographic band.
function useCollected(enabled: boolean) {
  const [state, setState] = useState<{ places: Shelved[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch("/api/place-import", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { saved?: { resolvedSpot?: { id: string; name: string; area: string; category: string } | null }[] }) => {
        if (!live) return;
        const places = (body.saved ?? []).flatMap((item) => item.resolvedSpot ? [{
          id: item.resolvedSpot.id, name: item.resolvedSpot.name, area: item.resolvedSpot.area, category: item.resolvedSpot.category,
          photo_url: null, photo_attribution: null, kind: "collected" as const,
        }] : []);
        setState({ places, failed: false });
      })
      .catch(() => { if (live) setState({ places: [], failed: true }); });
    return () => { live = false; };
  }, [enabled]);
  return state;
}

/**
 * My places: your own saved places, and the places you saved from links,
 * ready to pin into the vote before the catalogue deck. One cap of three
 * pins across both, so nothing is ever silently dropped.
 */
export default function MyPlacesShelf({ composer, age, sample }: { composer: Composer; age: number; sample: boolean }) {
  const { custom, togglePin, roundOf, pinnedIds, setTuneOpen } = composer;
  const collected = useCollected(!sample);
  const full = pinnedIds.length >= 3;

  const own: Shelved[] = custom.saved.map((place) => ({
    id: place.id, name: place.name, area: place.area, category: place.category, photo_url: null, photo_attribution: null, kind: "custom",
  }));
  const cards = sample ? SAMPLE : [...own, ...(collected?.places ?? []).filter((place) => !own.some((mine) => mine.id === place.id))]
    // The age rule every deal path applies; the server checks again on create.
    .filter((place) => !place.category || age >= minimumAgeForCategory(place.category));
  const failed = !sample && custom.loadFailed && collected?.failed;

  function addPlace() {
    setTuneOpen(true);
    custom.setOpen(true);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(".plan-custom-place__editor input");
      input?.scrollIntoView({ block: "center" });
      input?.focus({ preventScroll: true });
    });
  }

  return (
    <PlaceRow
      titleId="my-places-title"
      title={sample ? "My places · sample, as your saved places would show" : full ? "My places. Three pinned, one per round." : "My places. Tap one to put it in the vote."}
      cards={cards as RowCard[]}
      loading={!sample && (!custom.loaded || collected === null)}
      interactive={!sample}
      full={full}
      roundOf={roundOf}
      onToggle={(card) => {
        const place = card as Shelved;
        if (place.kind === "custom") custom.toggle(place.id);
        else togglePin({ id: place.id, name: place.name, area: place.area, photo_url: null, photo_attribution: null, from: "shelf" });
      }}
      empty={
        <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span>{failed ? "Your places didn’t load. Refresh to try again." : "Places you save show up here, ready to pin into any plan."}</span>
          {!failed && (
            <>
              <button type="button" onClick={addPlace} className="min-h-11 font-medium text-ink underline underline-offset-4">Add a place</button>
              <Link href="/home?view=discover" className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4">Import from a link</Link>
            </>
          )}
        </p>
      }
    />
  );
}
