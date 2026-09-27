import { appleDirectionsUrl, directionsUrl, uberUrl, type MappableVenue } from "@/lib/directions";

// P16: "Get there" in one tap from wherever the viewer is: Google for drive,
// metro and walk, Apple Maps, and an Uber ride. No origin is passed, so each
// app starts from the device's own location. No API key anywhere.
export default function GetThere({ venue, className = "" }: { venue: MappableVenue; className?: string }) {
  const uber = uberUrl(venue);
  const links: [string, string][] = [
    ["Drive", directionsUrl(venue, "driving")],
    ["Metro", directionsUrl(venue, "transit")],
    ["Walk", directionsUrl(venue, "walking")],
    ["Apple Maps", appleDirectionsUrl(venue, "driving")],
    ...(uber ? [["Uber", uber] as [string, string]] : []),
  ];
  return (
    <nav className={`get-there ${className}`.trim()} aria-label={`Get to ${venue.name}`}>
      <span className="get-there__label">Get there</span>
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}</a>
      ))}
    </nav>
  );
}
