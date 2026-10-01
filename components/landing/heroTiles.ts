// The cover's photographs, picked by hand, not the first N places: what a
// night out here can look like (the DIFC skyline at dusk, a beach club, the
// desert, dinner by the water, kites off Kite Beach, a night out). Only our
// OWN photos under public/venues that carry a CC licence and are credited on
// /credits: a venue's own website image (photo_source 'venue_site', no
// licence) may show the venue on its page but is not ours to put on a cover.
// Every tile is optimised and none needs a catalogue read or a Google key.
// The first is the desktop LCP; a phone shows the first three. No padel venue
// has a licensed photo yet.
export interface HeroTile { id: string; name: string; photo: string }

export const HERO_TILES: readonly HeroTile[] = [
  { id: "10000000-0000-0000-0000-000000000003", name: "Ninive", photo: "/venues/10000000-0000-0000-0000-000000000003.webp" },
  { id: "83000000-0000-0000-0000-000000000001", name: "DRIFT Beach", photo: "/venues/83000000-0000-0000-0000-000000000001.webp" },
  { id: "50000000-0000-0000-0000-000000000001", name: "Al Qudra Lakes", photo: "/venues/50000000-0000-0000-0000-000000000001.webp" },
  { id: "d0000000-0000-0000-0000-000000000003", name: "Shimmers", photo: "/venues/d0000000-0000-0000-0000-000000000003.webp" },
  { id: "40000000-0000-0000-0000-000000000001", name: "Kite Beach", photo: "/venues/40000000-0000-0000-0000-000000000001.webp" },
  { id: "81000000-0000-0000-0000-000000000001", name: "Soho Garden Meydan", photo: "/venues/81000000-0000-0000-0000-000000000001.webp" },
];
