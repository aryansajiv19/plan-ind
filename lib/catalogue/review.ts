// The human pick for migration 089: one row per OSM candidate in
// data/catalogue-089.json. The reviewer sets approved, writes vibe_final (or
// keeps the proposed line), or gives a reject_reason. Pure, for the tests.

import type { CatalogueRecord } from "@/lib/catalogue/sql";

export interface ReviewRow {
  id: string;
  osm: string; // "node/123"
  osm_url: string;
  name: string;
  category: string;
  area: string;
  district: string;
  cuisine: string;
  latitude: number;
  longitude: number;
  opening_hours: string | null;
  open_till: string;
  website: string | null;
  minimum_age: number;
  upkeep: number;
  proposed_vibe: string | null;
  proposed_vibe_source: string | null; // "osm:description" or the site URL
  approved: boolean;
  vibe_final: string | null;
  reject_reason: string | null;
}

/** Stable per OSM object, so a re-run never reshuffles: type digit + the id in hex, in the c0890000- range. */
export function idFor(osmRef: string): string {
  const [type, id] = osmRef.split("/");
  return `c0890000-0000-0000-000${type === "node" ? 1 : type === "way" ? 2 : 3}-${Number(id).toString(16).padStart(12, "0")}`;
}

/** Approved rows as records. Every approved row must have its final vibe, or nothing is emitted. */
export function approvedRecords(rows: readonly ReviewRow[]): CatalogueRecord[] {
  const approved = rows.filter((r) => r.approved === true);
  const missing = approved.filter((r) => !r.vibe_final?.trim()).map((r) => `${r.id} ${r.name}`);
  if (missing.length) throw new Error(`approved without vibe_final:\n  ${missing.join("\n  ")}`);
  const rejected = approved.filter((r) => r.reject_reason).map((r) => `${r.id} ${r.name}`);
  if (rejected.length) throw new Error(`approved and rejected at once:\n  ${rejected.join("\n  ")}`);
  return approved.map((r) => ({
    id: r.id, osmRef: r.osm, name: r.name, category: r.category, area: r.area, cuisine: r.cuisine,
    latitude: r.latitude, longitude: r.longitude, openTill: r.open_till, website: r.website, minimumAge: r.minimum_age,
    vibe: r.vibe_final!.trim(),
    // The proposed line kept word for word keeps its source; anything else is the reviewer's.
    vibeSource: r.vibe_final!.trim() === r.proposed_vibe?.trim() && r.proposed_vibe_source ? r.proposed_vibe_source : "reviewer",
  }));
}

/** "node/123" or "way/456=shisha" (the --add form): the ref and its forced category, or null. */
export function parseAddArg(arg: string): { ref: string; category: string | null } | null {
  const m = /^(node|way|relation)\/(\d{1,15})(?:=([a-z_]+))?$/.exec(arg.trim());
  return m ? { ref: `${m[1]}/${m[2]}`, category: m[3] ?? null } : null;
}
