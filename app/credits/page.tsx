import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Photo credits | Deal three" };
// Credits follow the catalogue, so read them per request.
export const dynamic = "force-dynamic";

// Our own venue photos carry no mark on the image; their licence credits
// (CC BY / BY-SA, each with its author and licence) are listed here, which
// the licences allow ("in any reasonable manner"). Google photos show their
// author beside the image, as Google's terms require.
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
      <Link href="/" className="legal-page__back">Deal three</Link>
      <article>
        <h1>Photo credits</h1>
        <p>Venue photos we host are used under Creative Commons licences. Each is credited to its author below, with its licence. Photos from Google Maps show their author on the photo.</p>
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
