// Migration 089's SQL from the reviewed rows (data/catalogue-089.json). Pure,
// so the unit test can check exactly what would be stored: only the columns
// below, each from OSM, the venue's own site, or authored by us. No Google
// field has a column here, and none may be added (lib/CLAUDE.md).

export interface CatalogueRecord {
  id: string;
  osmRef: string; // "node/123"
  name: string;
  category: string;
  area: string;
  cuisine: string;
  latitude: number;
  longitude: number;
  openTill: string;
  website: string | null;
  minimumAge: number;
  vibe: string;
  vibeSource: string; // "osm:description" or the site URL it came from
}

/** The only columns 089 writes. */
export const STORED_COLUMNS = [
  "id", "name", "category", "area", "cuisine", "price_band", "min_spend", "open_till", "vibe", "minimum_age",
  "latitude", "longitude", "website", "source", "visibility", "facts_checked_on", "facts_sources",
] as const;

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

export function catalogueSql(rows: readonly CatalogueRecord[], checkedOn: string): string {
  const values = rows.map((r) => {
    const sources = JSON.stringify([
      { field: "name, coordinates, category, cuisine, opening_hours, website", fact: `OpenStreetMap ${r.osmRef}`, url: `https://www.openstreetmap.org/${r.osmRef}` },
      { field: "vibe", fact: "The venue's own description", url: r.vibeSource.startsWith("http") ? r.vibeSource : `https://www.openstreetmap.org/${r.osmRef}` },
    ]);
    return `  (${[
      q(r.id), q(r.name), q(r.category), q(r.area), q(r.cuisine), "null", "0", q(r.openTill), q(r.vibe), String(r.minimumAge),
      String(r.latitude), String(r.longitude), r.website ? q(r.website) : "null", "'curated'", "'community'",
      q(checkedOn), `${q(sources)}::jsonb`,
    ].join(", ")})`;
  });
  return `insert into spots (${STORED_COLUMNS.join(", ")}) values\n${values.join(",\n")}\non conflict (id) do nothing;\n`;
}
