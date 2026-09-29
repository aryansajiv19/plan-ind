# The map style (owner setup, ~5 minutes)

The route map (components/route/RouteMap.tsx) is a Google map painted in the
app's desert-night palette. Google's terms allow our own look on a Google
map; they don't allow Google routes on a non-Google map, which is why the
route map stays Google underneath. Without these steps it shows Google's
stock style; the place page always shows our own SVG map (DubaiMiniMap).

1. Google Cloud console → Google Maps Platform → **Map styles** → Create
   style → **Import JSON** → paste the JSON below → Save.
2. **Map management** → Create map ID → type **JavaScript**, **Vector** →
   link it to the style from step 1.
3. Vercel → plan-ind → Settings → Environment Variables:
   `NEXT_PUBLIC_GOOGLE_MAP_ID` = the new Map ID (Production and Preview),
   alongside `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Redeploy.

```json
[
  { "elementType": "geometry", "stylers": [{ "color": "#0b1419" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#d9c3ab" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#07090d" }] },
  { "featureType": "administrative", "elementType": "geometry.stroke", "stylers": [{ "color": "#174050" }] },
  { "featureType": "landscape.natural", "elementType": "geometry", "stylers": [{ "color": "#1a120c" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "simplified" }] },
  { "featureType": "poi", "elementType": "labels.icon", "stylers": [{ "saturation": -60 }, { "lightness": -20 }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#12241d" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1c2b35" }] },
  { "featureType": "road.arterial", "elementType": "geometry", "stylers": [{ "color": "#223744" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#704121" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#442816" }] },
  { "featureType": "road", "elementType": "labels.text.fill", "stylers": [{ "color": "#9fb0bf" }] },
  { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#7d9bbc" }] },
  { "featureType": "transit.station", "elementType": "labels.text.fill", "stylers": [{ "color": "#ce9963" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f2a36" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#7d9bbc" }] }
]
```
