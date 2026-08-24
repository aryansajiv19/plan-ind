# plan-ind Working Checkpoint

Last updated: 2026-08-09 (Asia/Dubai)

## Build-order checkpoint 1: shared planning domain and demo entry

- Added `lib/planning.ts` with shared lifecycle, circle, moodboard, reminder and memory types plus versioned local-storage helpers.
- Migrated `DemoPlanningTools` from private component-only shapes to the shared planning domain.
- Development root now opens `/home-preview` when no user is signed in, keeping authentication deferred without hiding the product.
- Verification: ESLint, TypeScript, `git diff --check`, smoke checks and production build pass.
- Next action: secure plan state commands and make local/demo lifecycle behavior map cleanly to persisted plans.

## Implementation checkpoint: local-first planning layer

- Added `DemoPlanningTools` to the existing account views without changing the visual system.
- Friends now supports named circles and a local plan lifecycle with idea, voting, confirmation, RSVP, date and reminder state.
- Discover now supports moodboards containing places, links and photo-type ideas, with conversion into a plan.
- Been now supports local memory notes and photo previews after an outing; Profile shows reminder state.
- Demo data persists in localStorage; authentication and Supabase persistence remain intentionally deferred.
- Verification: ESLint, TypeScript, `git diff --check`, smoke checks and production build pass.

## Feature checkpoint: Planind Wrapped

- Added a Profile “Create my Wrapped” action in `DemoPlanningTools`.
- It generates a monthly local demo recap with plans, area, circle, signature plan and rating highlights, plus Share/Copy and Close actions.
- It uses browser sharing when available and clipboard fallback otherwise. No new UI system or external media service was introduced.
- Verification: lint, TypeScript, smoke checks and production build pass.
- Future production work: calculate monthly stats from persisted plans, votes, RSVPs, visits, photos and circles once authentication/persistence is enabled.

## Active implementation: secure plan creation and smoke checks

- Added `app/api/plans/route.ts` as the authenticated plan-creation boundary. It validates account age, category minimum age, every selected spot, custom-place ownership, prohibited venue text, nine unique candidates, deadlines, and applies a per-user plan rate limit.
- `components/StartPlanForm.tsx` now calls the server route instead of directly inserting `plans` and `plan_spots` from the browser.
- Added `supabase/migration-014-secure-plan-creation.sql`: plan ownership is stored in `created_by_user_id`; only authenticated owners can create plans or attach candidate spots. Public plan reads/voting remain unchanged.
- Added OTP request throttling in `app/auth/actions.ts` (three requests per email per ten minutes).
- Added `scripts/smoke-test.mjs` and `npm run test:smoke`; it currently checks `/login`, `/home-preview`, and unauthenticated `/api/plans` protection.
- Verification: smoke checks, ESLint, TypeScript, `git diff --check`, and production build all pass.
- Deployment note: apply migrations 013 and 014 after migration 012 before using live age-safe plan creation. Existing legacy plans remain readable because their creator may be null.
- User confirmation: migrations 013 and 014 were applied successfully in Supabase on 2026-08-09.
- Post-apply verification: read-only Supabase REST check returned HTTP 200 and confirmed age-restricted catalog rows (shisha 18+, lounges 21+); smoke checks still pass.
- OAuth verification: Supabase Auth settings currently report `external.google: false`; Google sign-in therefore cannot redirect until the provider is enabled and configured. The login page now shows a specific setup message for this case.
- Added `worklog.md` as the concise ongoing handoff with completed work, current blockers, verification, and next steps.
- Remaining review work: server-side enforcement for shared-plan candidate promotion, Playwright browser coverage, account deletion/export, and production-grade distributed rate limiting.

## Latest refinement: auth page visual alignment

- The user flagged that `/login` still looked like the older purple card UI.
- Reworked `app/login/page.tsx`, `components/AuthForm.tsx`, and `app/globals.css` to use the same architectural ivory, graphite, champagne-metal and restrained border language as the authenticated home and voting flows.
- The page now has a responsive editorial split layout with the Deal three mark, Dubai context, sign-in/join heading, Google/email actions, private age explanation, and mobile single-column behavior.
- Removed the old token shadow, grape primary button, heavy rounded corners, and pink error treatment from auth.
- Verification: ESLint, TypeScript and `git diff --check` pass. Keep the dev server at `http://localhost:3001`.

## Review checkpoint: testing and security pass

- Removed the decorative venue line from the auth page after review; it did not help sign-in or account creation.
- Verification: `npm run lint`, `npx tsc --noEmit --pretty false`, `npm run build`, `git diff --check`, and local HTTP checks for `/login` and `/home-preview` all pass. The repository has no `test` script yet.
- Security review finding: age eligibility is currently enforced in the plan composer/deal client path, while shared `plans` and `plan_spots` writes intentionally remain permissive for public-link collaboration. A direct client can therefore attach a restricted spot unless we add a server-side plan-creation RPC and creator ownership field.
- Security review finding: the mainstream-content constraint protects database spot writes, and the OAuth callback now validates the temporary DOB cookie before metadata updates.
- Recommended next work: add Playwright smoke coverage for auth/onboarding and plan creation; add a server-side `create_plan_with_spots` RPC that checks the creator's age and spot minimum age; add rate limiting/abuse monitoring around OTP, smart search, and public plan writes.

## Active checkpoint: age-aware, mainstream recommendations

- Request: collect age at sign-in, personalize venue suggestions by age, and keep the catalog suitable for a broad social app. Clubs/nightlife remain allowed; sexually explicit/adult-entertainment venues are not.
- Decisions: collect date of birth privately in Supabase Auth metadata, require accounts to be at least 13, use 18/21 venue thresholds, and enforce the prohibited-content rule at UI/API/database boundaries.
- Current milestone: policy/auth implementation in progress.
- Completed milestone: age policy module, private auth metadata capture, OAuth/email/onboarding handling, category/deal filtering, smart-search and place-link safeguards, and additive Supabase migration 013.
- Verification complete: ESLint, TypeScript, `git diff --check`, and the Next.js production build pass. The local health checks return HTTP 200 for `/home-preview` and `/login`.
- Runtime: the existing dev server is healthy at `http://localhost:3001`; port 3000 remains occupied by another process.
- Deployment note: apply `supabase/migration-013-age-safe-venues.sql` after migration 012. Until it is applied, live Supabase queries do not have the `minimum_age` column used by the new recommendation filter.
- Next action: apply migration 013 in Supabase, then test email/Google age capture and an under-21 plan against the live catalog.

## Latest implementation: progressive pools + saved custom places

- The active request is implemented: new plans deal 9 places across 3 pools. Each voter makes one exclusive choice per pool, one winner from each pool advances, and the final vote chooses the outing.
- `components/StartPlanForm.tsx` now deals nine related-category places, distributes them evenly across pools, and explains the `9 places -> 3 pools -> 3 finalists -> 1 plan` format. It also loads the signed-in member's saved custom places, lets them pin up to three, and includes a compact editor for name, area, map/address, note, and private/friends/community visibility.
- `app/plan/[id]/page.tsx` now renders one pool of three at a time with completed-pool navigation, phase-aware exclusive voting, deterministic pool winners, a final shortlist, and deterministic final tie-breaking. Existing plans remain backward-compatible as one-round finals.
- `lib/deal.ts` can deal an arbitrary count from related category families while preferring the exact requested category and avoiding pinned custom IDs. This is necessary because several exact catalog categories currently contain fewer than nine entries.
- `lib/types.ts` includes plan stages, pool metadata, vote phases, and saved custom-place ownership/location fields.
- `supabase/migration-009-pools-custom-spots.sql` is the additive production migration. It must be applied after migrations 007 and 008 before testing plan creation. `supabase/schema.sql` and `supabase/setup.sql` mirror the resulting core schema.
- UI additions in `app/globals.css` use the established architectural ivory/graphite/champagne system, include night mode, visible focus treatment, and mobile single-column form layout. No green/glowing states were introduced.
- Validation on 2026-08-07: ESLint passed, `tsc --noEmit` passed, and the Next.js 16.2.12 production build passed. The existing live preview at `http://localhost:3001/home-preview` returns HTTP 200.
- Known prototype constraints: promotion from pools to the final is currently a two-step client write rather than a database transaction; any participant with the link can trigger progression, matching the existing permissive shared-link trust model. Custom-place friend visibility still needs a membership-aware read policy; migration 010 adds that policy for visit photos specifically.

## Latest implementation: budget, distance and Been collections

- The plan composer now treats affordability and travel as recommendation inputs. Members can choose an AED-per-person ceiling, a starting area (Downtown/DIFC, Marina, Jumeirah, Al Quoz or Dubai Creek), and a 10/20/35 km or unrestricted radius.
- `lib/deal.ts` filters the curated catalog before ranking/dealing. It uses stored spot coordinates where present and otherwise falls back to the Dubai-area centroids in `lib/dubai-areas.ts`. Pinned custom places remain explicit overrides and are not randomly drawn into other plans.
- New plans persist `budget_per_person`, `origin_label`, origin coordinates and `radius_km`; the shared vote header repeats the constraint and venue cards show approximate distance when available.
- The Been demo is now organized as an archive rather than one flat grid. It ships with populated example collections, supports user-named collections, filtering, adding/removing visits, empty states and selecting the visit a new photo belongs to. Demo collection membership persists under `deal-three:demo-collections` in localStorage.
- `supabase/migration-010-recommendations-collections.sql` adds the plan constraints, authenticated `visit_collections`, many-to-many `visit_collection_items`, private `visit_photos` metadata, a private Storage bucket and owner/friend/community policies. Apply it after migration 009. The current image picker remains a local preview until its upload call is connected to that bucket.
- `supabase/schema.sql`, `supabase/setup.sql` (plan fields) and `lib/types.ts` mirror the new database shape.
- Verification on 2026-08-07: ESLint, TypeScript, `git diff --check` and the Next.js 16.2.12 production build pass. `http://localhost:3001/home-preview` returns 200.

## Latest implementation: Luna smart search

- A server-only smart-search route now lives at `app/api/smart-search/route.ts`. It uses the official `openai` SDK, Responses API, strict structured output and explicitly sets `model: "gpt-5.6-luna"` with low reasoning effort.
- The route requires an authenticated account in production, permits the unauthenticated development preview, limits each stable privacy-preserving identifier to 10 requests/minute, sends `store: false`, and never exposes `OPENAI_API_KEY` to the browser.
- Luna interprets natural Dubai requests into category, title, summary, budget, origin/radius, occasion, vibe terms and avoid terms. It is prohibited from returning venue names. Server normalization bounds every returned value before it reaches the client.
- `components/StartPlanForm.tsx` now has a polished natural-language search composer and parsed-intent summary. Applying intent updates the existing category, budget, area, radius and title controls. The API's returned model identifier is displayed so model usage is verifiable.
- `lib/deal.ts` remains the source of truth for real venues. It enforces budget/radius against Supabase and uses Luna's vibe/avoid terms only to rank/filter catalog text; the LLM cannot invent places, coordinates or prices.
- `supabase/migration-011-smart-search.sql` persists `smart_brief`, vibe/avoid preferences and `intelligence_model` on a plan. Apply it after migration 010. Canonical schema, setup schema and TypeScript types are synchronized.
- The corrected `OPENAI_API_KEY` is detected. A real API request reached OpenAI and received request ID `req_f7490e7ba4a34d0c82b8614196cc9fe3`, proving authentication/routing, but the account returned `credit_balance_exhausted`. Add OpenAI API credits before the live interpretation can succeed.
- Verification: ESLint, TypeScript, `git diff --check`, and the Next.js 16.2.12 production build pass. The build includes dynamic route `/api/smart-search`; the preview remains HTTP 200 on port 3001.

## Latest refinement: plain copy and personal city patterns

- The user again rejected technical filler. All visible “Powered by Luna,” model identifiers, “signals,” and “active” marketing language were removed. Luna remains an internal implementation detail. Internal home/demo class and field names using `signal` were also renamed to vote/context language so the old terminology does not return accidentally.
- Copy should use simple sentences and avoid frequent dashes. “Get active” is now “Move and play,” sports examples say Sports, and the profile heading is “What you usually choose.”
- Been now surfaces a restrained six weekend outing streak alongside annual visits, rating and photo count.
- Profile now includes “Your Dubai,” led by “Jumeirah is 31% of your city.” It shows current streak, personal best and the user’s visit distribution across Jumeirah, Al Quoz, Marina/JBR, Downtown/DIFC and elsewhere. Styling uses quiet typographic hierarchy and thin progress bars, without badges, glow, confetti or arcade language.
- These area affinities are derived conceptually from visit and spot area data; the current populated demo uses coherent fixed values until the account views are connected to live Supabase visits.
- Verification after this pass: ESLint, TypeScript, `git diff --check`, production build and the live preview health check all pass.

## End of day checkpoint: social place links

- The user identified social post to place resolution as a flagship feature. A member should paste an Instagram, TikTok, Facebook, Reddit, YouTube or normal web link, receive sourced venue details, then save the result to “Want to try” or “Planning.”
- A safe first framework is implemented. `components/PlaceLinkImporter.tsx` is now in Discover with URL input, destination list selection, loading/error/success states and a recent saved list. Preview persistence uses `deal-three:place-links` in local storage.
- `app/api/place-import/route.ts` is the authenticated production boundary. It does not fetch arbitrary pages. It validates the request and calls `lib/place-import.ts`, which classifies providers, removes common tracking parameters, clears fragments, and rejects malformed links, non web protocols and credential bearing URLs.
- `supabase/migration-012-place-link-imports.sql` adds owner scoped `place_imports`, `place_collections`, and `place_collection_items`. It creates “Want to try” and “Planning” for existing and future profiles. Apply after migration 011.
- `PLACE_IMPORT_ARCHITECTURE.md` is the complete handoff for the next agent. It defines the resolution pipeline, confidence handling, provider adapter boundary, screenshot fallback, source freshness, image rights, SSRF protections, next implementation sequence and acceptance criteria.
- Important boundary: current code saves working preview links locally and validates them server side. It does not yet scrape posts, resolve venues, fetch pictures, enrich pricing/reviews, or persist imports to Supabase. Do not claim those stages are complete.
- Verification: Instagram URL normalization removed `utm_source` and `igshid` correctly, `/api/place-import` returned `status: ready`, preview returned 200, ESLint passed, TypeScript passed, `git diff --check` passed, and the production build passed with both API routes.

## Immediate user direction after the latest review

- The user rejected tabs that merely explain what each area will eventually do. Every tab must look and behave like a genuinely used demo account, populated with Dubai places, visits, ratings, friends and personal-looking photos.
- Treat `/home-preview` as Aryan's established demo account. Populate it with coherent history and relationships so the end-to-end product flow is visible without requiring a real Supabase account.
- The intended information architecture remains: Plan, Discover, Been, Friends and Profile. Photos and ratings are contextual content inside venue and visit views, not separate top-level destinations.
- The next active implementation is replacing the current `LIBRARY_VIEWS` explanatory panels in `components/HomeExperience.tsx` with real demo-account UI:
  - Discover: photographic venue cards, rating/friend signals, price/area/category and selection affordances.
  - Been: photographic visit timeline/grid, personal score, date, companions, note and an add-photo affordance.
  - Friends: populated friend list, shared-place counts, recent shared outings and start-plan affordance.
  - Profile: Aryan's account summary, stats, preferences, privacy and sign-out.
- Four original demo images were generated using the built-in image generation skill. Copy them into `public/demo/` before referencing them in code:
  - dinner: `/Users/aryansajiv/.codex/generated_images/019fd85e-7627-7691-ac0e-13e4c3dde045/exec-5db9be21-d1a5-4da6-8b0f-51eab35c278e.png`
  - beach club: `/Users/aryansajiv/.codex/generated_images/019fd85e-7627-7691-ac0e-13e4c3dde045/exec-34b2c496-4c03-4bd2-84f6-53dc55b7d918.png`
  - padel: `/Users/aryansajiv/.codex/generated_images/019fd85e-7627-7691-ac0e-13e4c3dde045/exec-e76233eb-634a-42c5-bead-ebdd49344021.png`
  - Al Qudra: `/Users/aryansajiv/.codex/generated_images/019fd85e-7627-7691-ac0e-13e4c3dde045/exec-ad882d93-464e-4000-b3a6-078bfc27ad03.png`
- Image style: believable original user-generated Dubai photography, faces not identifiable, restrained editorial realism, no logos/text/watermarks and no green glow.
- Preserve the explicit permanent preference: no green glowing dots or pulsing status lights anywhere. This is also recorded in `FRONTEND_DESIGN_STANDARDS.md`.
- The user requested a cool night mode. A persistent day/night toggle already exists in `HomeExperience` via local storage key `deal-three:theme`; retain and refine it while building populated views.
- The user is about to compact the conversation. Read this section first after compaction and continue without asking them to restate the product flow.
- Completed after this checkpoint was started: `components/DemoAccountViews.tsx` now replaces all explanatory tab panels with a populated Aryan demo account. Discover has searchable/filterable photographic place cards and working “start a vote” actions; Been has four photographic visits, scores, notes, companion stacks and a local photo-picker preview; Friends has five populated relationships, taste-match/shared-visit data and crew planning actions; Profile has real-looking account statistics, taste signals, interactive photo privacy and a recent-photo strip.
- The four generated images are now project assets in `public/demo/`: `alserkal-dinner.png`, `beach-club.png`, `padel-night.png`, and `al-qudra-morning.png`.
- A `next/image fill` containment bug briefly made images cover the full viewport because the CSS pass was interrupted between the component and style edits. It is fixed: every fill wrapper is positioned, isolated, overflow-hidden and explicitly sized/aspect-ratio constrained in `app/globals.css`.
- Latest verification after the populated-account pass: ESLint passed, `tsc --noEmit` passed, and the Next.js 16.2.12 production build passed. The live server remains at `http://localhost:3001` and `/home-preview` returns 200.
- Latest visual direction feedback: the user likes the product and populated-account flow but found it too basic; the requested direction is sleek, luxurious and modern in a distinctly Dubai way. Interpret this as contemporary architecture/hospitality—not black-and-gold cliché, neon, excessive glass or decorative luxury tropes.
- The luxury refinement pass is implemented across `app/layout.tsx` and `app/globals.css`: Manrope replaces the chunkier Bricolage display treatment; the home surface is warm architectural ivory with graphite type and restrained champagne-metal detailing; navigation is sticky and uses a fine active line rather than filled tabs; hero weight/spacing is calmer; the decision console is obsidian with metallic hierarchy; cards use wider photographic crops and more deliberate spacing; controls, plan form and account views use finer borders and quieter elevation.
- Night mode was refined to an obsidian, warm-white and champagne system, removing the prior purple/pink impression while preserving the no-green-glow rule. Mobile navigation remains a safe-area-aware five-tab bottom bar.
- Verification after the luxury refinement: ESLint passed, `tsc --noEmit` passed and the full Next.js production build passed. The live server remains open at `http://localhost:3001`.
- The user explicitly rejected pseudo-technical filler copy such as “Live decision network,” “Signal active,” “Session 001,” numbered modules and slogan-like statistics. Permanent copy rule: associate the product with Dubai through real neighborhoods, venues, activities, timing and local context—not invented system language.
- The home hero now reads “Dubai plans, without the group chat,” with practical DIFC/Al Quoz/Palm copy. The console uses Ninive, The Guild and Koko Bay with real Dubai areas, vote counts and deadlines. The filler ticker/stats section was removed; plan composer labels now use plain language; footer is simply brand/year/Dubai.
- Demo account references to the fictional “Aster Courtyard” were replaced with Ninive at Emirates Towers. The Guild was verified against its official Dubai site and Visit Dubai; Kokoro/other current venue references should continue to be verified before catalog use.
- Consistency correction: the user noticed the public `/plan/[id]` voting flow still used the old playful visual system. The landing/home design is now the product-wide source of truth.
- `app/plan/[id]/page.tsx`, `components/NameGate.tsx`, `components/OptionCard.tsx`, `components/DecidedPlan.tsx`, and `app/globals.css` were aligned to the home system without changing vote/realtime/decision logic. Shared plans now use the same architectural ivory/graphite/champagne palette, Manrope typography, fine borders, square precision and quiet elevation. They inherit the saved `deal-three:theme` night preference.
- Removed legacy vote-page cues: token shadows, thick rounded cards, grape/pink/mint action states, the colorful winner rosette, excessive pills, checkmark symbols and star-glyph rating controls. Winner/selection/RSVP/rating states now use restrained metallic styling and numbered 1–5 rating controls.
- Verification after the cross-flow consistency pass: ESLint passed, `tsc --noEmit` passed, and the full Next.js production build passed. The running server compiled `/plan/11111111-1111-1111-1111-111111111111` and returned 200.

## Current state

- Baseline architecture review completed through the existing Graphify index in `graphify-out/`.
- Supabase Auth is implemented with Google OAuth, email OTP, cookie-backed SSR sessions, `/login`, `/auth/callback`, protected `/home`, and sign-out.
- Root `/` now redirects based on the verified user. Public `/plan/[id]` sharing remains intact.
- `supabase/migration-007-auth.sql` binds profiles to `auth.users` and owner-scopes social writes. It still needs to be applied in the Supabase project.
- Existing local profile display fields seed the authenticated profile, but the old public UUID/history is not claimed because it cannot prove ownership.
- The pre-auth home content now lives at `/home` as a temporary protected screen. The next feature is its mobile-first redesign.
- The protected `/home` landing page has now been redesigned as a kinetic night-out launchpad in `components/HomeExperience.tsx`, while `StartPlanForm` remains the unchanged plan-creation engine.
- Landing direction was revised after user feedback that the first pass felt sparse, kiddish, and "vibecoded." The current visual language is sharper and more editorial/architectural: strict grid, controlled asymmetry, technical metadata, restrained accents, and denser hierarchy.
- The emoji cards, colorful glow blobs, cursive annotations, and central decision wheel were replaced by a structured decision console with coordinates, numbered option channels, time/signal data, selection state, and a controlled scan animation.
- A third refinement moved the same direction toward a more minimal, posh hospitality feel: secondary annotations were removed, grid/pink intensity reduced, shadows softened, scan motion slowed, typography given more breathing room, and arcade-style depth replaced with quiet elevation.
- Motion still includes staggered hero typography, pointer parallax, the decision-system scan, a continuous information ticker, and animated CTA details. The global reduced-motion rule disables infinite landing animations.
- `app/home-preview/page.tsx` provides an unauthenticated development-only preview at `/home-preview`; it returns `notFound()` in production.
- Dashboard/provider setup is documented in `AUTH_SETUP.md`.
- The development server is running at `http://localhost:3001` in the current session because port 3000 was already occupied.
- Product scope is now explicitly both responsive web/PWA and a future native mobile app. Native should use Expo/React Native with shared Supabase/domain logic rather than wrapping the Next.js UI in a generic webview.
- The catalog must support every hangout type, not only dining. Use a multidimensional place/experience taxonomy rather than continually extending one flat category enum.
- Frontend standards now live in `FRONTEND_DESIGN_STANDARDS.md` and are referenced by `AGENTS.md`. The user explicitly excluded the original Product quality and Color sections; all other recorded sections are active.
- The home plan composer now presents 23 selectable Dubai plan types across five compact groups: Food & drink, After dark, Sun & water, Get active, and Culture & reset. Eleven new functional catalog categories were added: nightlife, live music, beach clubs, water activities, padel, adventure, arts and culture, wellness, shopping, family days, and city escapes.
- `supabase/migration-008-expanded-dubai-categories.sql` provides three starter spots for each new category and must be applied to the Supabase project before those new choices can create plans. `seed-categories.sql` was made non-destructive toward later category expansions.
- The landing now follows the calmer motion standard: pointer parallax, scan animation, looping ticker, pulsing live indicator, animated text arrow, and decorative noise markup were removed. The one-time page entrance and interaction feedback remain, with reduced-motion support.
- Category visuals in result cards now use short typographic codes rather than emoji interface icons.
- The authenticated home now has a responsive product navigation: Plan, Discover, Been, Friends, and Profile. It is inline on desktop/tablet and becomes a safe-area-aware bottom tab bar on mobile. The avatar opens Profile; sign-out moved into the Profile panel.
- Discover explains place detail, contextual ratings and tonight-fit signals. Been owns visits, user photos and personal ratings. Friends owns the friend list, shared history and crew-first planning. Photos and ratings intentionally remain contextual child views rather than cluttering the top-level navigation.
- A persistent Day/Night toggle is implemented in `HomeExperience` using `deal-three:theme` in local storage. Night mode uses a restrained deep neutral treatment rather than glow-heavy styling.
- Excessive space above the hero was reduced. All green glowing status dots were removed from the home console and voting cards, and `FRONTEND_DESIGN_STANDARDS.md` now permanently prohibits them.
- Competitive research and the recommended moat are documented in `PRODUCT_STRATEGY.md`. The positioning is the group decision layer for going out, not another inventory directory or booking marketplace.
- Do not scan the full repository. Start with a targeted Graphify query, then open only the files needed for the active feature.
- Before changing Next.js code, read the relevant guide under `node_modules/next/dist/docs/`; this repo's Next.js version has breaking changes from familiar conventions.

## Product and architecture map

- Product: a low-friction Dubai group-plan decider. A creator deals three pools of three, shares a link, the group shortlists one per pool, then votes on the final three.
- Main entry flow: `app/page.tsx` -> `components/StartPlanForm.tsx` -> Supabase-backed plan creation.
- Shared plan flow: `app/plan/[id]/page.tsx` coordinates name capture, voting, live tallies, deciding, and the decided state.
- Key plan UI: `components/NameGate.tsx`, `components/OptionCard.tsx`, `components/DecidedPlan.tsx`, and `components/ConfettiCanvas.tsx`.
- Core client/data modules: `lib/supabase.ts`, `lib/types.ts`, `lib/deal.ts`, `lib/device.ts`, `lib/calendar.ts`, `lib/categories.ts`, and `lib/social.ts`.
- Persistence is Supabase. The original planning domain centers on `spots`, `plans`, `plan_spots`, and `votes`; the graph also shows a newer social/profile domain in `lib/social.ts` and related types.
- Account/profile identity is Supabase Auth-backed; public shared-plan voting remains name-based and link-trusted. RLS is intentionally permissive for that voting loop, so do not claim stronger server enforcement than exists.
- Realtime subscriptions drive vote/plan updates and must be cleaned up on unmount.
- Winner selection is expected to use deterministic tie-breaking. `Plan.status` is exactly `open | decided`.
- `lib/types.ts` and Supabase schema/migrations must remain synchronized when data shapes change.

## Known risks and constraints

- Legacy device profiles remain readable but are no longer client-writable after migration 007. Their history is intentionally not auto-claimed.
- The shared-plan domain remains public and name-based; authentication currently secures profile/social ownership, not voting identity.
- Public profile and social-history reads remain intentional. Social mutations are owner-scoped after migration 007.
- Deadline and exactly-three-options rules may be app-enforced rather than database-enforced.
- Voter names may not be normalized.
- There is still no dedicated test runner. Verification currently uses ESLint, TypeScript, the production build, and live route checks.
- Preserve the user's existing untracked `.claude`, `.serena`, and `graphify-out` content.

## Workflow for the next feature

1. Query Graphify for the feature, affected symbols, and data flow.
2. Inspect only the resulting source files plus the relevant local Next.js docs.
3. Implement the smallest coherent change, preserving current invariants and unrelated work.
4. Run focused checks first, then broader checks in proportion to risk.
5. Update this checkpoint with the request, decisions, changed files, checks, unresolved issues, and exact next action.

## Next action

Read `PLACE_IMPORT_ARCHITECTURE.md` first. Apply migrations 009 through 012 in order. Connect the place importer to Supabase persistence, then build one compliant provider adapter plus screenshot fallback and confidence based confirmation. Separately add OpenAI API credits before testing smart search. After that, test a constrained multi pool plan with two identities, connect Been collections/photos to migration 010, and make pool advancement transactional. Keep the dev server open at `http://localhost:3001`.

## Authentication verification

- `npm run lint` — passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npm run build` — passed on Next.js 16.2.12; dynamic routes include `/`, `/login`, `/home`, `/auth/callback`, and `/plan/[id]`, with Proxy enabled.
- After the landing redesign: `npm run lint`, `npx tsc --noEmit --pretty false`, and `npm run build` all pass. The build also confirms the development-preview route compiles as a production 404 surface.
- After the sharper second pass: lint, TypeScript, and the full Next.js production build pass again.
- After the minimal-posh refinement: lint, TypeScript, and the full Next.js production build pass again.
- After the grouped 23-category picker and restrained-motion pass: lint, TypeScript, and the full Next.js production build pass again.

## Host-command security checkpoint — 2026-08-10

- Added migration 015 and a host-token RPC for atomic pool advancement, winner decisions, and committed event edits.
- Added the command API route and wired new-plan creators to a browser-local host token; legacy plans retain compatibility behavior.
- Removed permissive canonical plan/plan_spots transition policies in favor of creator-scoped plan updates and RPC execution.
- Checks passed: ESLint, TypeScript, `git diff --check`, smoke checks on the active dev server (`BASE_URL=http://localhost:3002`), and production build with network access.
- Apply `supabase/migration-015-host-plan-commands.sql` after migration 014 before creating new plans.
- Audit note: public vote/RSVP/rating writes remain name-based and link-trusted; participant identity and host-token recovery are still open design items.
- Removed the legacy public `clear plan_spots` delete policy as an additional audit fix.

## Smart-search validity checkpoint — 2026-08-10

- Smart search now rejects incoherent, unrelated, or non-hangout prompts with an invalid-plan response rather than guessing a category.
- The model output schema includes explicit validity and a short reason; existing safety and age checks remain in place.
- ESLint, TypeScript, and diff checks pass.
- Live endpoint diagnosis found the OpenAI organization has no remaining API credits (`429 insufficient_quota`); the app now surfaces this as a clear temporary-unavailable response.

## UI/UX audit checkpoint — 2026-08-10

- Completed the first UI/UX audit pass against the project’s design standards.
- Improved smart-search prompt guidance and stale-state handling, added shared-vote action guidance, and made preview-mode sign-in requirements explicit.
- ESLint, TypeScript, diff check, and live smoke checks pass.

## Shared voting mobile checkpoint — 2026-08-10

- Improved narrow-screen plan header wrapping, pool progress density, option-card spacing, and action guidance.
- Voting logic and data behavior remain unchanged.
- ESLint, TypeScript, diff check, and live smoke checks pass.

## RSVP choices checkpoint — 2026-08-10

- Added migration 016 for Coming / Maybe / Can’t make it attendance choices.
- Shared plan results now use the richer RSVP state while preserving legacy boolean rows.
- Smoke tests and production build pass.
- Apply `supabase/migration-016-rsvp-choices.sql` after migration 015.
- Live schema verification succeeded: Supabase REST returned RSVP `choice` data.

## Participant identity seam checkpoint — 2026-08-10

- Added migration 017 for nullable participant-token hashes on votes, RSVPs, and ratings.
- New browser interactions carry a per-plan token hash while legacy name-only rows remain readable.
- This is an intermediate compatibility seam; final server-authoritative participant enforcement remains next.
- Apply `supabase/migration-017-participant-token-seam.sql` before testing new shared-plan interactions.
- Smoke tests and production build pass.

## Participant write enforcement checkpoint — 2026-08-10

- Added migration 018 security-definer RPCs for vote, RSVP, and rating writes.
- Removed anonymous direct write policies from the canonical schema; the shared-plan client uses RPCs with participant-token hashes.
- Apply `supabase/migration-018-participant-write-rpcs.sql` after migration 017.
- ESLint, TypeScript, smoke tests, and production build pass.
- Live invalid-token verification returned 401 / SQLSTATE 42501, confirming the RPC authorization guard is active.

## Participant recovery UX checkpoint — 2026-08-10

- NameGate now explains device-bound participant persistence and same-browser return behavior.
- Tokens are not placed in URLs or exposed through copy actions.
- ESLint, TypeScript, diff check, and smoke tests pass.

## Live migration-order audit — 2026-08-10

- Live Supabase checks show migration 009’s prerequisite columns are missing: `plans.stage`, `plan_spots.pool_number`, `votes.phase`, and `spots.source`.
- Token columns and the 018 invalid-token guard are present, but the pool flow is not ready until migrations 009–012 are applied in sequence.
- Apply the missing foundation in order: 005, 006, 007, 008, 009, `010-recommendations-collections`, `011-smart-search`, then `012-place-link-imports`; then rerun shared-plan verification. Do not rerun 017/018 unless they were rolled back.
- Foundation now verified live: stage, pool, phase, source, and participant-token columns are present; invalid-token RPC calls remain blocked with 401 / SQLSTATE 42501.

## Security/code-review handoff — 2026-08-10

- Completed a read-only architecture/security review. No application code was changed in this review.
- Verified live protections: direct anonymous vote writes return 401 / SQLSTATE 42501; invalid participant RPC tokens are rejected.
- P0/P1 findings:
  - Public plan `select("*")` and realtime plan payloads can expose `host_token_hash`.
  - Participant RPCs do not yet validate plan/spot membership, phase/pool values, plan status, rating winner state, or non-empty voter names.
  - Authenticated users can change DOB metadata through `saveBirthDate`, allowing age escalation.
  - Plan creation is not transactional; rate limits are process-local; legacy plan transition fallbacks are incompatible with migration 015.
  - Social/profile reads remain broadly public; migration ordering needs a durable runbook.

### Next-agent handoff

Start with `app/plan/[id]/page.tsx`, `supabase/migration-015-host-plan-commands.sql`, `supabase/migration-018-participant-write-rpcs.sql`, and `app/auth/actions.ts`.

Build order:

1. Remove `host_token_hash` from every public projection and realtime payload.
2. Add relational/state validation to all participant RPCs and negative tests.
3. Protect DOB in a server-owned immutable profile record.
4. Then address transactional plan creation, distributed rate limiting, legacy plans, and social privacy.

Required verification after each stage: ESLint, TypeScript, `git diff --check`, smoke tests, production build, and live read-only Supabase checks.

## 390px phone layout checkpoint — 2026-08-11

- Static audit covered login, onboarding, home navigation, and voting responsive rules.
- CSS has dedicated mobile layouts and safe-area handling; no browser engine is installed here, so pixel-level verification remains pending.
- All 13 live smoke guards passed against the running local server on port 3001.
- Continue with signed-in place-link importer persistence, then return to browser-based layout verification when available.

## Signed-in importer persistence checkpoint — 2026-08-11

- Authenticated place-link imports now persist in `place_imports` and link to the Planning collection via `place_collection_items`.
- Authenticated GET loading restores saved links across devices; normalized duplicates are idempotent.
- Demo mode remains localStorage-only and classifies links without an anonymous API write.
- ESLint, TypeScript, diff check, and 13 live smoke guards pass. Build is network-blocked by Google Fonts fetches only.

## Saved-link collections interaction checkpoint — 2026-08-11

- Saved links now have interactive All, Want to try, and Planning filters.
- Filter controls remain compact and horizontally scrollable on phone layouts.

## Interaction polish checkpoint — 2026-08-11

- Home tabs now support horizontal swiping on touch devices.
- Tab changes use optional haptics with feature detection and no dependency.
- Buttons have subtle press feedback; avatar focus has a restrained motion cue.
- Reduced-motion handling remains enabled globally.

## Playful energy layer checkpoint — 2026-08-11

- Added small spring, tilt, reaction-pop, and active-row pulse details while preserving the sleek architecture.
- Motion is disabled for reduced-motion users and does not require a new dependency.

## Claude handoff checkpoint — 2026-08-11

- Latest work: authenticated importer persistence, saved-link filters, swipe tab navigation, optional haptics, tactile reactions, and playful motion polish.
- Verification: ESLint, TypeScript, diff check, and all 13 live smoke guards pass.
- Local server: `http://localhost:3001` is responding; `/login` returns 200.
- Build caveat: production build can fail only because Google Fonts cannot be fetched in the restricted environment.
- Pending: authenticated visit collections/photos, friend invites, distributed rate limiting, browser-based 390px verification, and persisted drag/reorder flows.
- Read `NEXT_AGENT.md` and the latest `worklog.md` before editing. Do not recreate migrations 017–019.

## Colour-for-state and swipeable voting — 2026-08-11 (Claude)

Request: the app felt "too sleek and modern" for young adults — keep the sleek
base, add energy, and make it genuinely interactive.

- Added one live accent, `--color-live`, used for **state only**. `you and now`
  takes the accent (your vote, your finished round, a count that just changed);
  `the outcome` keeps champagne (winner, decided plan). These were previously
  the same champagne, so your own pick was indistinguishable from the winner.
- The accent is theme-scoped because no single hue clears AA on both grounds:
  cobalt `#2f4bd6` is 6.00:1 on ivory, 2.91:1 on obsidian, so night uses
  `#8aa0ff` at 8.02:1. Selected chip measures 6.49:1 day / 7.51:1 night.
- The rule is now recorded in `FRONTEND_DESIGN_STANDARDS.md` under Colour so it
  does not drift back into decorative colour.
- Voting round on phones is a CSS `scroll-snap` carousel with the next card
  peeking. Native scroll-snap rather than a drag library: the browser supplies
  momentum and touch physics, the cards stay real buttons so keyboard and screen
  reader behaviour is unchanged, and peeking neighbours keep it a comparison
  rather than a blind swipe.
- Round progress is now dots; finished rounds carry the accent. The round
  animates in once on change. A tally arriving over realtime bumps and clears.
- Removed `active-row-pulse` — it animated infinitely, against the standing
  "no constant movement" rule, and this project had already removed a pulsing
  indicator once by explicit decision.
- Mirrored the previous pass's hover tilts onto `:active`. They were hover-only,
  so on the phone this app targets the whole feedback layer never fired.
- Note for whoever picks this up: `navigator.vibrate` (the haptics helper in
  `lib/interaction.ts`) is **not supported on iOS Safari**. It is harmless on
  Android but must never be the only feedback for an action.
- Verification: ESLint, TypeScript, production build and all 13 live smoke
  guards pass.
- **Not verified visually:** the carousel and the round dots. The browser in
  this environment will not resize below 1342px, and the seeded demo plan
  (`11111111-…`) is a legacy single-round plan so it renders no round dots.
  Both need a real device or DevTools device mode.

## Production security and mobile-preview checkpoint — 2026-08-19

### Worktree state

- The implementation is intentionally uncommitted. Preserve all current
  changes; do not reset the tree or treat Graphify output as accidental.
- The previously incomplete local edits in migrations 015 and 016 were
  restored to their committed content before this work began.
- Graphify was queried before implementation and refreshed afterward. The
  current graph contains 794 nodes, 1,245 edges, and 68 communities.

### Security boundary implemented

- `proxy.ts` and `next.config.ts` now provide CSP nonces, same-origin request
  propagation, secure headers, production HTTPS/HSTS, restrictive browser
  permissions, production clickjacking protection, and a double-submit CSRF
  cookie. Development omits only the framing restrictions required by the
  Cursor Mobile Preview iframe.
- All mutating application routes validate origin, Fetch Metadata and CSRF,
  stream and cap JSON request bodies, reject unsupported content types, and
  sanitize bounded plain text. Client callers use `secureJsonFetch`.
- Supabase cookies use explicit `Secure` production behavior, `SameSite=Lax`,
  and root paths. Anonymous guest auth is not treated as a permanent account.
- Email OTP uses Cloudflare Turnstile in production and deliberately returns
  the same outward response on provider success/failure to reduce user
  enumeration. Shared plan links use Turnstile plus Supabase anonymous auth.
- Smart search treats user text as untrusted, uses a hashed safety identifier,
  no longer leaks model details in responses, and consumes durable database
  quotas: 10/minute, 30/user/day and 300/global/day.
- Place import and plan creation also consume durable quotas. Security events
  are minimized and stored through a secret-authorized RPC; raw emails,
  prompts, cookies and tokens are not logged.
- Upload inputs accept only JPEG/PNG/WebP, enforce byte limits, decode the
  image, and reject oversized dimensions/pixel counts. The Storage bucket is
  restricted to the same MIME types and an 8 MB ceiling by migration 020.

### Database migration 020

- Added plan membership through `plan_access`; the share UUID is redeemed into
  an authenticated guest membership before tables or private Presence expose
  a plan.
- Replaced public plan/vote/RSVP/rating reads with authenticated membership
  policies. Participant RPCs require authenticated membership, while a trigger
  protects future participant write paths and another trigger sanitizes names.
- Added `create_secure_plan(jsonb, uuid[])`: nine unique same-category spots,
  ownership/curation checks, immutable age enforcement, future deadline,
  bounded fields, server-generated host token, plan rows and membership are
  created in one transaction. Direct client mutations are revoked.
- Social reads are owner/friend scoped, anonymous guests cannot create durable
  profiles, DOB remains server-owned, and custom-spot writes require a
  permanent owner.
- Added durable quotas, minimized security events, private plan Presence, and
  a 90-day/2-day cleanup function. The entire end state is mirrored in
  `supabase/schema.sql`.
- **Not deployed:** migration 020 is pending in the hosted project. Follow
  `SECURITY_SETUP.md`; do not describe the new RLS/quota layer as live yet.

### Visual and product-quality cleanup

- Removed the decorative skyline, confetti/rainbow treatment, radial/dot
  decoration, prominent shadows, moving hover transforms and rendered emoji
  avatars. Typography remains within the existing two-family design system.
- Replaced Google-hosted fonts with open-licensed local assets in
  `public/fonts`, eliminating network-dependent font builds.
- Added environment-backed `/terms` and `/privacy` pages and linked them from
  login/profile. A Vercel production build fails when legal identity variables
  are missing rather than publishing placeholder legal information.
- Upgraded Next.js and `eslint-config-next` to 16.3.1. The build script uses
  the supported webpack builder because Turbopack cannot bind its internal
  worker port in this restricted execution environment.

### Mobile Preview setup and next visual task

- Cursor extension: `lirobi.phone-preview` 3.1.9.
- Workspace defaults: `.vscode/settings.json` points to
  `http://localhost:3001` and selects iPhone 13 Pro.
- The extension is hard-coded to editor column two. Hide Cursor's Secondary
  Sidebar to give it the right side. Its phone scale is limited by available
  vertical space; keep the terminal visible but drag the terminal's top border
  downward so it is roughly 5–8 lines tall.
- The home preview has now been seen in a phone frame. The next agent should
  inspect alignment and overflow at `/login`, `/onboarding`, all five `/home`
  tabs, and a real three-round `/plan/[id]` before changing layout CSS.

### Verification completed

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run test:security` passed all three focused suites.
- `npm run build` passed for all 15 routes using Next 16.3.1 and webpack.
- `npm run test:smoke` passed route, header, CSRF and existing live migration
  019 database guards against `http://localhost:3001`.
- `npm audit` reports zero vulnerabilities.
- `git diff --check` passed and the targeted secret scan found no credentials.

### Owner actions still required

1. Apply migration 020 to Supabase and record the live date in `worklog.md`.
2. Insert the bcrypt hash of `SECURITY_CONTROL_SECRET` and set the matching
   server-only Vercel variable.
3. Enable anonymous sign-ins and Cloudflare Turnstile in Supabase Auth; set OTP
   expiry to ten minutes or less.
4. Set the Turnstile site key, canonical site URL and legal operator/contact/
   jurisdiction variables in Vercel.
5. Schedule `purge_security_operational_data()` daily, then run an end-to-end
   permanent-user plus anonymous-guest shared-plan test.

## AI-engineering workstream opened — 2026-08-24

Working branch: **`ai-engineering`** (branched from `main` at `3dd972b`).
Plan file: `~/.claude/plans/i-want-to-build-binary-heron.md`.

### The request

Build plan-ind out as a multi-agent system while learning core AI engineering:
observability, RAG, and tool calling. Requested order was: apply migration 020 →
Langfuse → RAG for Luna (pgvector) → Luna as a tool-calling agent → venue
resolution pipeline → real friend invites → Wrapped on real data → an
end-to-end Langfuse trace. The user explicitly said not to follow the brief
rigidly where a better call exists.

### Four corrections made to that brief, with reasoning

**1. Agent structure — one new agent, not four.** The brief asked for
Orchestrator / Builder / Worker / Audit. This repo already splits agents by
**file ownership** under a "one owner per file" rule; that split is by **role
tier**. Layering it on creates two competing ownership systems — exactly the
collision the rule prevents. The mapping was already near-identical: `security`
is the Worker, `qa-test` is the Audit, `backend-data` + `frontend` are the
Builder (split by layer, which is *better* — it prevents collisions), and
`CLAUDE.md` already assigns the orchestrator role to the main session.

The genuine gap was that **nobody owned the AI layer**. Added exactly one agent,
`ai-engineer`. Also added `.claude/skills/`, which did not exist at all.

**2. Langfuse traces Luna, not the coding agents.** The brief wanted a dashboard
of "every agent... how long it took, what it cost." Langfuse can only instrument
LLM calls the *application* makes. Claude Code's subagents run inside the
harness with no hook for our code and cannot appear in it. Once Luna becomes a
tool-calling agent, Langfuse does show what was actually wanted: nested spans
for retrieval, each tool call, latency and cost.

**3. Migration 020 was an outage fix, not hardening.** See `worklog.md`.
Plan creation had been broken live. This was found by tracing
`app/api/plans/route.ts:48` to `create_secure_plan` and probing the live DB.

**4. Venue resolution is blocked on persistence, not AI.** `PlaceLinkImporter`
still writes to localStorage even though migration 012 created `place_imports`,
`place_collections` and `place_collection_items`. The honest next step there is
persistence — a pure `backend-data` task with no AI dependency. When matching is
built, the caption *is* the query string: embed it and reuse the same index RAG
builds. That satisfies "never let an LLM invent the final venue" structurally,
because the LLM is not in the loop at all.

### Architectural finding that shapes the RAG work

**`lib/deal.ts` runs in the browser.** It imports the `@supabase/ssr` browser
client and ships the whole candidate pool plus every matching `ratings` row to
the client on each deal. It therefore **cannot embed a query** — that needs the
server-side OpenAI key. Semantic retrieval must move server-side.

The recommended shape (not yet built): move the whole body of
`dealSpotsForCategory` into `POST /api/spots/deal` and reduce `lib/deal.ts` to a
`secureJsonFetch` call with the identical signature. This also closes a real
hole — `age` is currently a client-supplied prop (`StartPlanForm.tsx:296`) used
by a browser-side filter, so a hostile client can pass `age: 99`. Server-side it
comes from `memberAge()` instead. One route, two ranking qualities: try to embed
the query, and `??` fall back to the existing keyword `preferenceScore` when
embedding returns null — that is the credits-out fallback and it costs one
operator, not a second code path.

**Do not merge retrieval into `/api/smart-search`.** The form interprets on one
button press and deals on a *different* one, and the user edits the form in
between; ids returned at interpret time would be stale by construction.

### Migration 021 design (agreed, being written)

Two things belong in 021:
- The `revoke ... from public, anon, authenticated` fix for defect 1 in the worklog.
- Later, when RAG lands: `vector` extension, `spots.embedding vector(1536)`, a
  generated `embed_text` column plus an `embedding_hash` for free incremental
  staleness (`where embedding is null or embedding_hash is distinct from
  md5(embed_text)`), the missing `spots (source, category)` btree index, and a
  `match_spots()` RPC that is **`security invoker`** so it respects 020's
  `read permitted spots` policy rather than bypassing it.

**No vector index at ~100 rows** — a brute-force `<=>` scan is sub-millisecond
and HNSW returns approximate results for no gain. Comment the ~5k threshold.

**Age and budget go in the `WHERE` clause; similarity only ever in `ORDER BY`.**
Ranking must never move an excluded row back in. The category→min-age map stays
in TypeScript (`lib/age-policy.ts`); mirroring it into SQL guarantees drift.

### State at end of session

Committed on `ai-engineering`:
- `38d0138` — `ai-engineer` agent, `openai-responses` skill, README/CLAUDE.md routing.

Uncommitted / in flight when the session ended:
- `supabase/migration-021-revoke-anon-execute.sql` — `backend-data` was writing it.
- `app/plan/[id]/page.tsx` — `frontend` was fixing the share-link notfound flash.
- `scripts/smoke-test.mjs` + `package.json` — `qa-test` added the 020 guard block
  behind `--020` and the `test:smoke:020` script. **Verify these are complete
  and green before building on them.**

`AGENTS.md` is modified only because `next dev` regenerates its rules block.

### A visual observation NOT to act on

A browser screenshot of `/home-preview` showed the nav rendering but a blank
body. `curl` of the same URL returns 25 KB of HTML containing `home-experience`,
`hero` and the real copy, and the console had no application errors. Per
`NEXT_AGENT.md` §3, screenshots in this environment are sometimes stale and
three "bugs" in an earlier session were capture artifacts. Treat this as
unconfirmed; verify with `getComputedStyle` / `getBoundingClientRect` before
changing any code.
