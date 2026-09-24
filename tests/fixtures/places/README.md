Recorded-shape Google Places API (New) responses for the hermetic Places
tests (`tests/places-*.test.ts`) and the loopback mock server
(`tests/fixtures/places/mock-server.mjs`). Shapes follow the documented
response format of `places:searchText`, Place Details and
`photos/*/media?skipHttpRedirect=true`; ids, URLs and authors are fixture
values, not real Google content. `spots.json` mirrors five real curated rows
(ids, areas and coordinates from seed.sql / migration 037).
