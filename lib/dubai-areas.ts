export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const DUBAI_ORIGINS = [
  { label: "Anywhere in Dubai", value: "anywhere", coordinates: null },
  { label: "Downtown / DIFC", value: "downtown", coordinates: { latitude: 25.2048, longitude: 55.2708 } },
  { label: "Dubai Marina", value: "marina", coordinates: { latitude: 25.0805, longitude: 55.1403 } },
  { label: "Jumeirah", value: "jumeirah", coordinates: { latitude: 25.204, longitude: 55.238 } },
  { label: "Al Quoz", value: "al-quoz", coordinates: { latitude: 25.1345, longitude: 55.2346 } },
  { label: "Dubai Creek", value: "creek", coordinates: { latitude: 25.244, longitude: 55.331 } },
] as const;

const AREA_CENTRES: Record<string, Coordinates> = {
  "address dubai mall": { latitude: 25.197, longitude: 55.279 },
  "address sky view": { latitude: 25.201, longitude: 55.269 },
  "al barsha": { latitude: 25.11, longitude: 55.2 },
  "al habtoor city": { latitude: 25.183, longitude: 55.255 },
  "al khawaneej": { latitude: 25.235, longitude: 55.474 },
  "al quoz": { latitude: 25.135, longitude: 55.235 },
  "al satwa": { latitude: 25.229, longitude: 55.27 },
  "al serkal avenue": { latitude: 25.143, longitude: 55.224 },
  alserkal: { latitude: 25.143, longitude: 55.224 },
  "alserkal avenue": { latitude: 25.143, longitude: 55.224 },
  "al shindagha": { latitude: 25.268, longitude: 55.29 },
  "al warqa": { latitude: 25.191, longitude: 55.408 },
  "al wasl": { latitude: 25.205, longitude: 55.257 },
  atlantis: { latitude: 25.131, longitude: 55.117 },
  "caesars palace": { latitude: 25.079, longitude: 55.122 },
  "city walk": { latitude: 25.207, longitude: 55.263 },
  "design district": { latitude: 25.187, longitude: 55.299 },
  difc: { latitude: 25.211, longitude: 55.28 },
  "dubai creek": { latitude: 25.244, longitude: 55.331 },
  "dubai desert": { latitude: 24.98, longitude: 55.51 },
  "dubai design district": { latitude: 25.187, longitude: 55.299 },
  "dubai festival city": { latitude: 25.223, longitude: 55.35 },
  "dubai hills": { latitude: 25.113, longitude: 55.249 },
  "dubai mall": { latitude: 25.198, longitude: 55.279 },
  "dubai marina": { latitude: 25.08, longitude: 55.14 },
  "dubai world trade centre": { latitude: 25.228, longitude: 55.287 },
  downtown: { latitude: 25.197, longitude: 55.274 },
  "downtown dubai": { latitude: 25.197, longitude: 55.274 },
  "emirates towers": { latitude: 25.217, longitude: 55.283 },
  "grand millennium": { latitude: 25.101, longitude: 55.177 },
  hatta: { latitude: 24.8, longitude: 56.12 },
  jaddaf: { latitude: 25.224, longitude: 55.338 },
  "jaddaf waterfront": { latitude: 25.224, longitude: 55.338 },
  jbr: { latitude: 25.078, longitude: 55.134 },
  jlt: { latitude: 25.074, longitude: 55.148 },
  jumeirah: { latitude: 25.204, longitude: 55.238 },
  "jumeirah beach": { latitude: 25.181, longitude: 55.221 },
  "jw marriott marquis": { latitude: 25.185, longitude: 55.258 },
  "le royal meridien": { latitude: 25.087, longitude: 55.145 },
  "madinat jumeirah": { latitude: 25.132, longitude: 55.185 },
  "mall of the emirates": { latitude: 25.118, longitude: 55.2 },
  meydan: { latitude: 25.157, longitude: 55.301 },
  "mushrif park": { latitude: 25.217, longitude: 55.449 },
  "nad al sheba": { latitude: 25.155, longitude: 55.33 },
  "one&only royal mirage": { latitude: 25.098, longitude: 55.153 },
  "palm jumeirah": { latitude: 25.112, longitude: 55.139 },
  "pearl jumeirah": { latitude: 25.234, longitude: 55.257 },
  "seih al salam": { latitude: 24.845, longitude: 55.346 },
  "the lakes": { latitude: 25.099, longitude: 55.171 },
  "the oberoi": { latitude: 25.186, longitude: 55.265 },
  "trade centre": { latitude: 25.225, longitude: 55.283 },
  "umm suqeim": { latitude: 25.154, longitude: 55.205 },
  "world islands": { latitude: 25.226, longitude: 55.164 },
};

export function coordinatesForArea(area: string): Coordinates | null {
  return AREA_CENTRES[area.trim().toLowerCase()] ?? null;
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLatitude = radians(to.latitude - from.latitude);
  const dLongitude = radians(to.longitude - from.longitude);
  const a = Math.sin(dLatitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(dLongitude / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}
