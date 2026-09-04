# Place link import

Last updated: 2026-08-07, Asia/Dubai

## Product goal

A person pastes a social post or website link. The app identifies the place shown, matches it to a trustworthy place record, presents useful details, and saves it to a personal list without making the person research it themselves.

The completed experience should return:

* place name and category
* Dubai area and map location
* cuisine or activity type
* estimated price per person and minimum spend
* opening hours and booking link when available
* review summary with source attribution
* a small set of images that the product is allowed to display
* confidence and a confirmation step when the match is uncertain

## Framework shipped in this checkpoint

`components/PlaceLinkImporter.tsx` is rendered in Discover. It accepts a URL, lets the member choose “Want to try” or “Planning,” calls the validation endpoint, and keeps the latest links in local storage for the working preview.

`app/api/place-import/route.ts` is the server boundary. In production it requires authentication. It validates input and delegates URL normalization to `lib/place-import.ts`.

`lib/place-import.ts` recognizes Instagram, TikTok, Facebook, Reddit, YouTube, and normal websites. It removes common tracking parameters and rejects malformed links, non web protocols, and links containing credentials.

`supabase/migration-012-place-link-imports.sql` adds:

* `place_imports` for the original link, provider, resolution state, extracted metadata, and eventual spot match
* `place_collections` for the two default lists and future custom lists
* `place_collection_items` for resolved spots or unresolved imports
* owner scoped RLS and automatic creation of “Want to try” and “Planning” for profiles

The endpoint does not yet fetch the social page and the preview does not yet write these records to Supabase. That is intentional. Apply migration 012 before connecting persistence.

## Resolution pipeline to build next

### 1. Intake

Normalize the URL, identify the provider, deduplicate it per user, create a pending import, and add it to the selected list immediately. The original post must remain accessible even when resolution fails.

### 2. Obtain permitted source material

Use a provider adapter for each platform. Prefer official APIs, embed metadata, or user supplied screenshots and captions. Do not create a generic server fetch endpoint. Do not bypass login walls or platform access controls.

Private, deleted, region restricted, or otherwise inaccessible posts should move to `needs_input`. Ask the user for a screenshot, copied caption, creator name, or rough area instead of pretending the place was found.

### 3. Extract clues

Produce a small evidence object containing visible names, caption text, hashtags, cuisine clues, landmarks, neighborhood clues, creator claims, and image observations. Keep every clue tied to its source.

### 4. Generate candidates

Search the internal `spots` catalog first. If no strong candidate exists, query an approved place data provider. Candidate generation should use name similarity, Dubai area, coordinates, category, and visual or caption clues.

### 5. Resolve confidence

High confidence matches can proceed to enrichment. Medium confidence should show two or three candidates for confirmation. Low confidence must ask the user for more information.

Never let an LLM invent the final venue. The final result must correspond to a real catalog or place provider identifier.

### 6. Enrich and reconcile

Store stable facts separately from source claims. Prices, minimum spend, hours, reviews, booking information, and images change at different rates and need source names plus retrieval timestamps. Reuse an existing `spots` row when the venue already exists.

### 7. Present and save

Show the matched place, why it matched, useful details, source freshness, and any uncertainty. Let the member confirm, correct, save, move between lists, or turn the place into a plan.

## Security and reliability rules

* Keep all provider credentials on the server.
* Use an allowlisted provider adapter for known platforms (TikTok, YouTube,
  Reddit's oEmbed hosts — fixed, hardcoded destinations; the user's URL is
  only a query parameter). Instagram and Facebook's oEmbed/Graph APIs have
  required an approved app + access token since ~2018–2020 and no
  credentials for either exist in this project — those go straight to
  `needs_input`, not a fetch attempt.
* **Amendment, 2026-09-04 (`lib/place-import/web-adapter.ts`):** the `web`
  provider (an arbitrary site, not a fixed host) is a deliberate,
  security-reviewed exception to "never accept an arbitrary URL and fetch it
  from the application server" above — Deal Three's own "paste a website
  link" case needs it, and it is fully hardened rather than a raw fetch:
  DNS-resolved and private-IP-checked before connecting, every redirect hop
  re-validated the same way, 5s timeout, 512KB streamed-and-capped response,
  content-type allowlisted (`lib/place-import/safe-fetch.ts`). Residual risk
  is bounded to "the app can be made to issue a handful of rate-limited
  outbound requests to attacker-chosen *public* hosts" (mild relay/
  amplification concern, not internal-network exposure), accepted for this
  app's threat tier. Keep this note in sync with the code if that adapter's
  design changes — a stale "never" here misleads the next reader.
* Block private IP ranges (including CGNAT `100.64.0.0/10`, which is a real
  reachable target on several hosting platforms, not just RFC-1918 space),
  redirects to unapproved hosts, oversized responses, and unsupported media
  before any future fetch implementation.
* Treat captions, page metadata, OCR, and model output as untrusted input.
* Do not display images unless their terms and delivery method allow it. A link to the original post is always safe fallback context.
* Store the evidence and confidence that led to a match so corrections are auditable.
* Apply per user rate limits and background job limits before enabling automated resolution.

## Suggested next coding session

1. Apply migrations 009 through 012 in order.
2. Add Supabase data access functions for collections, imports, and list items.
3. Replace the importer’s local storage persistence with those functions while retaining local optimistic UI.
4. Implement one provider adapter first. Instagram public post metadata is the most relevant initial path, but verify the currently permitted API or embed method before coding it.
5. Add screenshot upload as the universal fallback.
6. Add the resolver job interface and confidence states without adding every provider at once.
7. Test malformed links, duplicate links, tracking parameters, redirects, inaccessible posts, incorrect matches, and cross account RLS.

## Completion criteria for the first real provider

A signed in member can paste a supported public link, leave the page, return later, see resolution progress, confirm a real Dubai place, inspect sourced details, and keep it in either default collection. Failures remain recoverable and never silently become invented venue records.
