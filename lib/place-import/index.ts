// Client-safe only. resolvePlaceImport (./resolve) pulls in "server-only"
// transitively (safe-fetch.ts/oembed.ts) -- components/PlaceLinkImporter.tsx
// imports this barrel, so re-exporting it here would leak server-only code
// into the client bundle. Server code imports resolvePlaceImport directly
// from "@/lib/place-import/resolve" instead.
export { classifyPlaceLink, type PlaceLinkProvider, type PlaceCollectionKind, type PlaceLinkCandidate } from "./classify";
