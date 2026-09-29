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
  /** Where the vibe line came from: "reviewer", "osm:description", or the site URL. */
  vibeSource: string;
}

/** The only columns 089 writes. */
export const STORED_COLUMNS = [
  "id", "name", "category", "area", "cuisine", "price_band", "min_spend", "open_till", "vibe", "minimum_age",
  "latitude", "longitude", "website", "source", "visibility", "facts_checked_on", "facts_sources",
] as const;

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The website as spots_website_http accepts it (^https?://): OSM often has a
 * bare domain ("clawbbq.com"), which would abort the whole migration. A bare
 * domain gets https://; anything else that isn't http(s) is dropped.
 */
export function websiteUrl(raw: string | null): string | null {
  const url = raw?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(url) ? `https://${url}` : null;
}
/** A SQL line comment can't be ended early by what's in it. */
const comment = (value: string) => value.replace(/[\r\n]+/g, " ");

export function catalogueSql(rows: readonly CatalogueRecord[], checkedOn: string): string {
  const values = rows.map((r) => {
    const website = websiteUrl(r.website);
    const osmUrl = `https://www.openstreetmap.org/${r.osmRef}`;
    const vibeFact = r.vibeSource === "reviewer" ? "Written by the plan-ind reviewer"
      : r.vibeSource === "osm:description" ? "OpenStreetMap description" : "The venue's own site";
    const sources = JSON.stringify([
      { field: "name, coordinates, category, cuisine, opening_hours, website", fact: `OpenStreetMap ${r.osmRef}`, url: osmUrl },
      { field: "vibe", fact: vibeFact, url: r.vibeSource.startsWith("http") ? r.vibeSource : osmUrl },
    ]);
    return `  -- ${comment(r.name)} · ${r.category} · ${r.area} · vibe: ${comment(r.vibeSource)}\n  (${[
      q(r.id), q(r.name), q(r.category), q(r.area), q(r.cuisine), "null", "0", q(r.openTill), q(r.vibe), String(r.minimumAge),
      String(r.latitude), String(r.longitude), website ? q(website) : "null", "'curated'", "'community'",
      q(checkedOn), `${q(sources)}::jsonb`,
    ].join(", ")})`;
  });
  return `insert into spots (${STORED_COLUMNS.join(", ")}) values\n${values.join(",\n")}\non conflict (id) do nothing;\n`;
}
