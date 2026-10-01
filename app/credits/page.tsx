import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DEMO_PHOTO_SOURCES } from "@/components/demo/sampleDecision";

export const metadata: Metadata = { title: "Photo credits | Planind" };
// Credits follow the catalogue, so read them per request.
export const dynamic = "force-dynamic";

// Our own venue photos carry no mark on the image; their licence credits
// (CC BY / BY-SA, each with its author and licence) are listed here, which
// the licences allow ("in any reasonable manner"). A venue's own site image
// needs no licence credit, but the sample decision's are listed with their
// source. Google photos show their author beside the image, as Google's
// terms require.
export default async function CreditsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spots")
    .select("id, name, area, photo_attribution")
    .eq("source", "curated")
    .not("photo_url", "is", null)
    .not("photo_attribution", "is", null)
    .order("name");
  return (
    <main className="legal-page">
      <Link href="/" className="legal-page__back">Planind</Link>
      <article>
        <h1>Photo credits</h1>
        <p>Venue photos we host are either used under Creative Commons licences, each credited to its author below with its licence, or are the venue’s own image from its website. Photos from Google Maps show their author on the photo.</p>
        {error ? (
          <p role="alert">The credits didn’t load. Refresh to try again.</p>
        ) : (
          <ul className="credits-list">
            {(data ?? []).map((spot) => (
              <li key={spot.id}>
                <Link href={`/place/${spot.id}`}>{spot.name}</Link>
                <span>{spot.area}</span>
                <span>{spot.photo_attribution}</span>
              </li>
            ))}
          </ul>
        )}
        <h2>The demo</h2>
        <p>These venue photos in the demo are each venue’s own image, from its website.</p>
        <ul className="credits-list">
          {DEMO_PHOTO_SOURCES.map((photo) => {
            const site = new URL(photo.site).hostname.replace(/^www\./, "");
            return (
              <li key={photo.spotId}>
                {photo.spotId.startsWith("sample-")
                  ? <a href={photo.site} rel="noopener noreferrer" target="_blank">{photo.name}</a>
                  : <Link href={`/place/${photo.spotId}`}>{photo.name}</Link>}
                <span>The venue’s own photo / {site}</span>
              </li>
            );
          })}
        </ul>
        {/* ODbL: the catalogue's venue data from OSM (089) and the metro network. */}
        <h2>Venue data</h2>
        <p>
          Venue names, locations, opening hours and the metro network come in part from{" "}
          <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">© OpenStreetMap contributors</a>,
          available under the Open Database Licence (ODbL).
        </p>
      </article>
    </main>
  );
}
