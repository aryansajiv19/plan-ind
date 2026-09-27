# plan-ind product roadmap (audit 2026-09-27)


## Phase 1: broken and dead ends (must fix)

### P1 [frontend / S] Commit B8 and keep the tap-to-fan deck

Where: ../plan-ind-A (uncommitted: LandingNav.tsx, lib/home-views.ts, HowItWorks.tsx, app/demo/page.tsx ?view=); lane/frontend-a dc2eca4 LiveVoteLoop `inert`; components/kokonutui/card-stack.tsx; HomeExperience.tsx:338-343 aria-hidden .home-stage

What: Commit the WIP now, because an uncommitted tree has been lost before. The landing tabs link to /demo?view=X. Take the planned 'delete card-stack.tsx' step out of B8. Keep the tap deck as the hero, or make LiveVoteLoop tappable (a tap casts the 'You' vote), and put photographed spots first. Drop aria-hidden from the stage once it holds a real control.

Why: This is the owner's literal question (where are the tabs), and it protects the one interaction they said they love.

### P2 [frontend / S] Let guests move through the rounds

Where: components/vote/RoundActions.tsx:28-36, :64-66; app/plan/[id]/page.tsx:207 (onContinue is only a local setActivePool)

What: Show non-hosts the local Next-round button in the 'pool' stage. After a pick, auto-advance to the next pool you haven't voted in (poolsChosenByMe already exists). Change the copy to 'Pick one in each round'. Show 'Waiting for the host' only once allPoolsChosen.

Why: Verified on main: guests are told to wait and never vote in pools 2 and 3, so the host alone picks two of the three finalists.

### P3 [server / S] Add a 'Your plans' rail on /home

Where: app/home/page.tsx:67 Promise.all (no plans read); HomeExperience Plan tab

What: Add one RLS-scoped read to the existing Promise.all: plans select id,title,status,stage,deadline,event_time,winner_spot_id, ordered by created_at, limit 8. Render a horizontal rail above the composer with a state line on each card: 'Round 2 · closes 9pm', 'Decided · Fri 8pm', or 'Rate it'. A read failure shows UnavailableState. Empty shows nothing.

Why: Today a plan can only be reached again through its share link, which breaks decide → book → show up. No migration is needed.

### P4 [backend-sql / M] Make deadlines fire server-side

Where: hooks/use-host-commands.ts:251-266 (host-only timer); cast_plan_vote closes at deadline; PlanHeader.tsx:4-12 static chip

What: Add a security-definer RPC, expire_plan(p_plan_id), callable by any plan_access member. It is idempotent and runs the existing advance/decide branch only when deadline <= now(). Call it from every client's timer and on plan load. Disable cards once the deadline has passed, and tick the chip with use-minute-clock. Run the security subagent.

Why: With the host offline, a plan freezes at 'Voting closed' and every card tap errors.

### P5 [server / S] Stop the deal lying about why it failed

Where: lib/spots/match.ts:260-289 (null on read failure) → app/api/spots/deal/route.ts:111-126 → StartPlanForm.tsx:162

What: dealSpotIds returns {ids}|{tooFew}|{unavailable}. The unavailable case becomes a 503 'Couldn't deal places right now'. {ids:null} is kept only for a genuinely thin pool.

Why: This is the silent-failure class: a database blip currently tells the host to raise their budget.

### P6 [server / M] Warn before submit when a setting can't fill nine

Where: StartPlanForm.tsx:24-37, 252-254, 364-385; match.ts families

What: Add one GET /api/spots/deal/preview?category&origin that returns eligible counts per budget × radius option from the cached pool, with age taken from the session. Label chips with the count ('Up to AED 100 · 1 place'), disable options under 9, and hide categories that can never fill at the viewer's age (Live music, Karaoke, Beaches, Water for 18-20).

Why: Several visible options are dead ends that only fail after the reveal animation starts.

### P7 [frontend / S] Fix the signed-out composer controls that fail after typing

Where: StartPlanForm.tsx:103-139 (smart search → 401), CustomPlaces.tsx:79-83,130-165 ('Sign in again'), sign-in links at StartPlanForm.tsx:426, HomeExperience.tsx:291, SampleDecided.tsx:91; app/api/smart-search/route.ts:62-75

What: In demoMode, the smart-search button becomes 'Sign in to build this' and 'Add a place' becomes a sign-in link. Save the draft {category,budget,origin,radius,title,smartQuery} to sessionStorage and point sign-in at /login?next=/home. On mount, StartPlanForm restores the draft through `prefill` and then clears it. The smart-search route checks OPENAI_API_KEY before consumeQuota, and the page hides the box when the key is absent.

Why: The first two inputs a visitor uses refuse them only after they've done the work, and signing in then throws their draft away.

### P8 [server / M] Make 'Preview the deal' use the visitor's settings

Where: StartPlanForm.tsx:197, :234 (SAMPLE_POOLS.flat())

What: Add a signed-out branch of the deal: GET, eligibleDealSpots over readFamily's cached rows, strictest age gate, writes nothing, IP rate-limited. Pass the rows into DealReveal `cards`. Fall back to SAMPLE_POOLS only when fewer than 9 match, and say so. Update demo-flow.spec to assert the category matches.

Why: Picking Padel under AED 100 currently shows AED 550 dinners, so the first impression is that the settings do nothing.

### P9 [frontend / S] Select address and google_place_id, and link cards to place details

Where: hooks/use-plan-data.ts:177 spots select; app/place/[id]/page.tsx:38 and :156 ('Back to Discover' → /home); lib/spots/catalogue.ts DISCOVER_COLUMNS; OptionCard.tsx and DecidedPlan winner (no link)

What: Add address, google_place_id and minimum_age to the three selects. Add a 'Details' link on OptionCard and the winner, going to /place/[id]. Back becomes router.back(), falling back to /home?view=discover when signed in or / when signed out. Signed-out visitors get 'Plan a night here' → /login?next=/place/<id>.

Why: 'Where' always prints 'Area, Dubai', Maps pins can't use the Google place, and voters can't check a place without casting a vote on it.

### P10 [frontend / M] Call the Google photo route

Where: app/api/spots/[id]/photo/route.ts (no caller); PhotoTile.tsx:41, OptionCard.tsx, card-stack.tsx:244, place hero

What: Add one useSpotPhoto(spot) hook. When photo_url is null and google_place_id is set (signed in), it fetches the route once and renders the uri with its attribution through PhotoCredit, falling back to the typographic tile on 401/404/429/503. Use it on the place hero, the winner and OptionCard first, and keep it off grids until the 300/day cap is re-checked.

Why: Without this, the Places key lands and not one photo appears.

### P11 [backend-sql / S] Rate only after the outing, and keep reopen and Been truthful

Where: RatingSection.tsx:40-60; rate_plan (no event_time check); reopen_plan:35-36; unrate_plan; hooks/use-plan-device.ts:22-27 addBeen on decide

What: Render rating only when event_time <= now(), or decided_at + 3h when no time is set. rate_plan refuses before that time, and unrate_plan deletes the visit its rating created. Move addBeen from decide into rememberVisit.

Why: One tap straight after deciding logs a fake visit and permanently blocks reopen.

### P12 [frontend / S] Fix the direct-plan form

Where: DirectPlanForm.tsx:61-75 (no try/catch), :106-129 (budget/radius do nothing); DirectPlanSearch.tsx:27-40, 72-74

What: Delete the budget and radius controls and keep 'Starting around'. Wrap submit in try/catch so an error resets the button. Search matches name, area and cuisine (.or ilike), shows a real error separately from 'no matches', and lists the catalogue as tiles before the user types.

Why: A dropped network leaves 'Locking it in…' spinning forever, and the dead budget control can contradict the place in PlanHeader.

### P13 [frontend / S] Make account surfaces say when a read or write failed

Where: DiscoverTab.tsx:66 (source=curated) and :84 (error ignored), :138 slice(0,8); useBeenCollections.ts:79,88; lib/social/photos.ts:76; PlaceLinkImporter.tsx:71, :203

What: Drop the source filter. Show 'Search failed' on error. Render every category chip in a scroll row. Set collectionError on create and add failures. getVisitPhotos returns ListRead, and a failure shows UnavailableState. The importer shows a load error plus a 'Show all' toggle.

Why: These are five instances of the repo's dominant bug shape: a failure that looks like an empty result.

### P14 [frontend / S] Add Settings, including account deletion

Where: components/account/ProfileTab.tsx; app/api/account/delete/route.ts (no caller); AgeForm.tsx footnote points to a 'Settings' that doesn't exist; app/onboarding/page.tsx:31-34

What: Add an anchored Settings block at the top of Profile, not a sixth tab. It holds name, emoji, birthday correction, sign out, and 'Delete account' (type DELETE → secureJsonFetch POST → clearAccountState, signOut, replace('/')). Onboarding adds a 'What should friends call you?' field that feeds ensureOwnProfile. The header avatar shows the chosen emoji.

Why: The owner asked where Settings is. Deletion is promised on /privacy but unreachable, and email sign-ups vote under their email prefix.

### P15 [backend-sql / S] Let the host cancel a decided plan

Where: app/plan/[id]/page.tsx:231-235 (controls hidden once decided); delete_plan → already_decided 409

What: Allow delete_plan on a decided plan that has no ratings or visits, and render the existing confirm in the decided branch.

Why: A night that falls through currently sits in everyone's list forever.


## Phase 2: 'never ask a friend' place and transport details

### P16 [frontend / S] Directions from each viewer: Drive, Metro, Walk and Uber

Where: lib/directions.ts:37-50 (directionsUrl needs an origin), :66-70 'rush hour'; components/vote/GettingThere.tsx:14-41; app/place/[id]/page.tsx:107-134

What: Make the origin optional so Google Maps starts from the device location, and pass destination_place_id when known. Add a 'Get there' row on the place page and the winner: Google travelmode driving/transit/walking, Apple daddr+dirflg, and Uber's documented universal link. Show no Careem or S'hail link. The drive estimate says 'rush hour' only for 7-10 and 17-20 Dubai time. Add one test per builder.

Why: Most plans use the default 'anywhere' origin, so they show no directions at all today. This works for every viewer with no API key.

### P17 [data / M] Nearest metro and walk time

Where: new lib/dubai-metro.ts; GettingThere.tsx; OptionCard meta; place page

What: A static list of about 55 Red and Green line stations (OSM, with attribution) and a nearestStation() built on the existing distanceKm. It renders 'Nearest metro: Business Bay, ≈ 8 min walk (estimate)' under 1.5 km, and otherwise 'No metro within walking distance, drive or taxi'. Pair it with the feels-like temperature to suggest a taxi from the station in extreme heat. Add one unit test.

Why: This answers the owner's named question, 'do I need to take the metro?', without a transit API.

### P18 [frontend / S] Show each voter's own distance and drive time on the cards

Where: app/plan/[id]/page.tsx:187 (km from the host's origin); OptionCard.tsx:120

What: A 'You're coming from' select, using DUBAI_ORIGINS plus navigator.geolocation, kept in localStorage and never sent to the server. Card meta reads 'from AED 150pp · 9 km · ≈ 25 min drive'. Spots with no coordinates show no line. Add Business Bay, Deira, JVC, Mirdif, DSO and Sharjah to DUBAI_ORIGINS.

Why: Voters are deciding with the host's commute instead of their own.

### P19 [data / M] Coordinates and addresses for all 82 venues, plus an area fallback

Where: spots.address (0/82), latitude/longitude (44/82); GettingThere.tsx

What: One editorial pass: our own street address plus coordinates for every venue (nothing copied from Google, per 063). Also seed local spots so travel and weather can be tested. Until that pass is done, GettingThere falls back to coordinatesForArea(area), labelled '(area estimate)'.

Why: 38 venues can't show distance, weather or a drive estimate at all.

### P20 [backend-sql / M] A 'Know before you go' facts row

Where: supabase/schema.sql:90-136; place page:99 ('From AED X pp'); DecidedPlan

What: Now: an age badge, max(minimum_age, minimumAgeForCategory) → '21+, bring ID'. Then one additive migration (with lib/types.ts in the same pass): parking, dress_code, booking_required, spend_kind ('minimum'|'typical'), and an optional opens_at. Fill them in the data pass. Render them as a facts row on the place page and the winner, with empty rows hidden.

Why: Valet, dress code, ID, whether to book, and what the AED figure means are exactly the group-chat questions.

### P21 [backend-sql / M] Ask 'When' at creation

Where: StartPlanForm.tsx:18-22, 403-416 (only 'Voting closes'); create_secure_plan allowlist; lib/open-hours.ts fitForEvent

What: When chips (Tonight 8pm, Tomorrow evening, Friday brunch, and a datetime-local input set in Dubai time). Pass eventTime through create_secure_plan. The deadline becomes max(event − 2h, now + 1h), and the separate deadline picker is deleted. eligibleDealSpots drops places whose closing time is before the event when an event time is set.

Why: Voters currently don't know when the plan is, the deal ignores opening hours, and weather can't show until after the decision.

### P22 [backend-sql / M] Turn carpool and booking into coordination

Where: WhosInSection.tsx:83-120; rsvps (transport, seats only); BookingSection.tsx:66-77 (host only)

What: Add rsvps.from_area and ride_with through set_plan_rsvp (drop the old signature). Show 'Ride with Omar (2 seats left)', with seats checked on the server. Add claim_booking(p_plan_id, p_release) so any member can say 'I'll book it', and show the head count next to the booking link. Run the security subagent.

Why: Today the list only says who needs a ride. Pickups and booking still happen in WhatsApp.

### P23 [frontend / S] Fix the time picker and calendar details

Where: DecidedPlan.tsx:195-206 (saves on the first keystroke, in the viewer's time zone); lib/calendar.ts:19-24, 43-45 (no newline escape)

What: Local state with Save and Cancel, and `${value}:00+04:00` labelled 'Dubai time'. The calendar LOCATION uses the address or lat,lng, and DESCRIPTION carries the plan URL and the Maps link. esc() escapes \r?\n. Add tests/calendar.test.ts.

Why: Hosts abroad currently save the wrong time, and the calendar entry can't route to the venue.

### P24 [server / L] Real routes and live hours once the key lands

Where: new /api/spots/[id]/route and /details; consume_app_quota scope list (hard-coded)

What: A Routes API computeRoutes call: TRANSIT legs, and DRIVE with departureTime set to event_time, from the viewer's origin, which is sent per request and never stored. Place Details regularOpeningHours, fetched live. Both no-store, both behind new 'route' and 'place-details' quota scopes (one migration), with Google attribution. Place page and winner only.

Why: Gives 'Red Line to Business Bay, 5 min walk' and real opening days. At tens of users this should stay inside the free tier.


## Phase 3: interface 'wow'

### P25 [frontend / L] Put content first in the composer

Where: StartPlanForm.tsx:268-437; HomeExperience.tsx:355-374 steps list; plan-round-summary :316-321

What: Order: a category row that doubles as a horizontal deck of that group's real places (tap to pin), then a primary 'Deal nine' button. Then a native <details> 'Tune it' whose summary shows the constraintChips, holding budget, from, when, title and Luna as a one-line bar. Snap Luna's values to the nearest chip. Remember the last settings in localStorage. Delete the 9/3/3/1 strip and the steps list, and say 'rounds' everywhere.

Why: Nine stacked settings sections read like a settings page. Every field has a valid default, so the page length is the only thing standing in front of the deal.

### P26 [server / S] Reveal the real nine cards

Where: DealReveal.tsx:27-29,115-125; /api/spots/deal DEAL_SPOT_COLUMNS

What: The deal returns {id,name,area,photo_url,min_spend}. Await the deal first (it's cached), then flip the real cards: a photo, or the serif name. This also removes the 'reveal, then bounce to an error' flash.

Why: The one moment meant to delight currently shows nine 'DIN' codes.

### P27 [frontend / S] Put a media band on the vote cards

Where: components/OptionCard.tsx:82-195 (the whole card is a button, and photo_url is never rendered)

What: A fixed 4:3 band: next/image plus PhotoCredit, or the name in the display serif on the raised surface so heights match. Split the card into a Select button and the Details link from Phase 1.

Why: This is the screen the whole group looks at, and every venue upgrades automatically once ingestion runs.

### P28 [frontend / S] Put real photos and 'right now' on the landing

Where: components/demo/sampleDecision.ts:31-39 (photo_url null); lib/spots/catalogue.ts:76-89 (A–Z order); HomeExperience.tsx:94,305 greeting

What: Match SAMPLE_POOLS to curatedDiscover rows by name and copy photo_url and coordinates across. The wall picks per request: open now (open-hours), at most two per category, photos first, and photographed tiles at a larger size. Compute the greeting on the server from Dubai time, without 'Dubai' as the addressee.

Why: The hero shows 'DIN' even for Tresind, which has a real photo, and 'right now' is really the A–B slice of the catalogue.

### P29 [frontend / M] Show the planner payoff before sign-up

Where: components/demo/SampleDecided.tsx:82-84 (one sentence)

What: Render the real GettingThere (with the new Drive/Metro/Walk row and the metro line) and VenueMap for the sample winner, plus a labelled read-only RSVP and carpool list ('Omar driving, 3 seats; Priya needs a ride').

Why: It turns 'a poll' into 'a planner' in the ten seconds before anyone signs up.

### P30 [frontend / S] Make the demo honest

Where: components/DemoPlanningTools.tsx + lib/planning.ts (demo only); DemoAccountViews.tsx:346 Photo privacy, :179-215 no moodboards, :209 empty prefill

What: Delete DemoPlanningTools and lib/planning.ts, and the photo-privacy block. Add 2-3 fixture moodboards using MoodboardTile. 'Start a vote with this place', here and on the real PlaceCard.tsx:46 and FriendsTab.tsx:62, passes a PlanPrefill (category, originForArea, title).

Why: The demo currently sells friend circles and reminders that signing up doesn't deliver.

### P31 [backend-sql / M] Close the share and return loop

Where: plan_share_preview (062); app/plan/[id]/opengraph-image.tsx; DecidedPlan.tsx:229 order; FriendsPanel.tsx:73

What: Add voter_count and coming_count (counts only) to plan_share_preview, for the login card and OG ('4 have voted · closes 9pm'), with a security review. After event_time + 2h, put Rate and 'Add photos' first on DecidedPlan. At advance or decide, show the host a one-tap WhatsApp nudge (shareMessage already exists). A friend row opens that friend's visits wall via getProfileVisits.

Why: This is the Partiful/Beli retention mechanic, and it makes the promised 'friends see each other's log' real.


## Phase 4: coverage, data and hygiene

### P32 [data / L] Run Places ingestion and add the category depth

Where: lib/places/**, docs/PLACES_INGESTION_SCOPE.md; match.ts tier fill

What: Run the existing pipeline once the key lands, aiming for at least 15 per category. Until then, add a reveal chip such as '4 brunch spots filled in; Dinner has 5 places' via categoryDistance.

Why: Every default Dinner deal is the same nine places, and vibe, ratings and 'been' have nothing to rank.

### P33 [frontend / L] End-to-end tests for create, lifecycle and last mile

Where: tests/e2e/ (only /demo and single guest votes); plan-factory.ts admin inserts

What: Three specs via the qa-test subagent. (1) create-plan through the UI, plus the dead-end negative. (2) host and guest in two contexts: 3 pools → final → decide, with the guest able to advance (a regression guard for Phase 1). (3) the decided plan: RSVP and carpool seen by the other member, a booking claim, set a time, calendar links, rate → Been, then undo. Add signed-in /home?view=* and /plan/<id> to the runtime-health and visual specs.

Why: 'Every setting tested' isn't true today, and every Phase 1 bug got through CI.

### P34 [backend-sql / M] DB tests and retire verify-journey

Where: reopen_plan, leave_plan, delete_plan (happy path), create_direct_plan, delete_my_account, friend-invite RPCs; scripts/verify-journey.mjs (stale since 09-06, hard-coded ports)

What: One dbtest describe per RPC result code. Move verify-journey's import and photo steps into Playwright, then delete the script.

Why: These RPCs have no test at any tier, and a stale script that never runs gives false confidence.

### P35 [frontend / S] Copy and duplicate-code cleanup

Where: login/page.tsx:29-33 and AuthForm.tsx:52-55 (dev copy, text 'G'); CustomPlaces.tsx:91-94,109 ('$$', 'Flexible', 'migration'); match.ts:131-132 substring avoid; directions.ts haversineKm vs dubai-areas distanceKm; WrappedRecap.tsx:48,55 'Planind'; ProfileTab.tsx:41 'people'

What: User-facing copy and an SVG Google mark. Save empty price and hours for custom places. Word-boundary avoid matching, used as a penalty unless 9 places remain. Delete haversineKm. Use the 'Deal three' brand name. Relabel the count as 'went out with'.

Why: Developer text, invented facts and brand drift are small things that together make it read as unfinished.


## Needs the owner
- Google Places API key: the single biggest visual lever (6/82 photos). Phase 1's photo hook only pays off once it lands.
- A Google Routes API key and billing on the same Cloud project, with a budget alert. Check current pricing first: the audit's $5/1k Routes and $20/1k Place Details figures are from memory.
- Say 'go live' so 067/068 get applied to production. The F2 fix (own rows found by id via my_plan_rows) falls back to name matching until then.
- Decide the hero: keep the tap-to-fan card-stack, or a tappable LiveVoteLoop. B8 currently plans to delete card-stack.
- Editorial facts for 82 venues (address, parking, dress code, whether booking is needed, what the spend figure means). Someone has to write or check this content.
- Enable the Google auth provider (still pending).
- Theme: delete the parked dark-mode path, or restore the toggle. Don't keep both.
- Product calls: can any member claim the booking, or only the host? Should moodboards be shareable with a plan's group? That needs an RLS change and a security review.

## Doubts about the audits
- The decide audit's 'NameGate loops forever' and 'client name ≠ stored name' findings are stale. On main, c89464e deleted NameGate, b4d3a5d finds your own rows by id via my_plan_rows, and a7c6d26 dropped the name refusals and voter_name unique keys; the voter name is the profile's, up to 40 characters. The quality audit's 'open F2 name-squat bug' is stale for the same reason. What's left is deploying 067/068, not client work.
- Quality's fix for the signed-out preview ('deal client-side from the spots prop') won't work. That prop is the 12-18 tile wall, not the catalogue, so filtering by category and budget almost always drops under 9. Use a server read of the cached family rows.
- Line refs are off in places. use-plan-data's spots select is at :177, not :141 or :157. Some first-impression evidence was curled from the dev server, which runs the plan-ind-A B8 worktree, not main.
- The 'My plans' effort is overstated as M. It is one select inside an existing Promise.all, and RLS already scopes it: S.
- 'Settings as a sixth tab' works against a bottom bar below 520px. An anchored block in Profile is enough. The people columns home_origin, usual_transport and default_budget are premature: localStorage 'remember last settings' covers the default-budget and origin need without a migration.
- Web push for round changes is overbuilt for tens of users. A WhatsApp nudge at advance and decide covers it.
- expire_plan triggered by clients means an untouched plan stays unexpired until someone opens it. That's fine, because the state resolves on the next view. pg_cron isn't needed at this load.
- Keep checking that Uber's m.uber.com/ul universal link is still documented before shipping it. Careem and S'hail are correctly excluded.
- The photo 'Who sees it' setting, used by nobody. Hiding it until a friend view exists is cheaper than building one first. Phase 3 builds the friend wall anyway.
- The account audit's 'companions saved by name only' (log_plan_visit RPC) was left out of the 30. It's real, but it only matters once friend pages exist; add it alongside the friend-wall item.

## Benchmark proposals
- [high/S] Partiful 'Upcoming' list / Instagram Stories row: the first thing a returning user sees is their own live things, with state on each: Server/frontend. Add one RLS-scoped read to the home Promise.all: `supabase.from('plans').select('id,title,status,stage,deadline,event_time,winner_spot_id').order('created_at',{ascending:false}).limit(8)`. The plans SELECT policy is already plan_access-scoped, so no migration is needed, and it never selects created_by_user_id (051). Under the appbar, render a horizontal snap rail of compact cards with an honest state line: 'Round 2 of 3 · closes 9pm' (reuse closesLabel from vote/PlanHeader.tsx), 'Decided · Fri 8pm', or 'Rate it' once event_time has passed. When the list is empty, show nothing. When the read fails, show the UnavailableState, not an empty rail (the silent-failure rule). Each card links to /plan/<id>. (app/home/page.tsx:67 (Promise.all, no plans read) + components/HomeExperience.tsx:303 (signed-in appbar 'What are we doing?'). Verified: the only `from("plans")` reads in the app are by-id in hooks/use-plan-data.ts:108/128 and hooks/use-host-commands.ts:93, so a plan you host or voted on is not listed anywhere in the app. Close the tab and the only way back is the chat link. This is the biggest dead end for coming back.)
- [high/M] TikTok/Partiful low-effort entry: one tap produces something, and the knobs are optional: Frontend. Reorder to: category chips, then a primary 'Deal nine' button straight away. Put smart search, budget, origin/radius, title and deadline inside one native <details> labelled 'Tune it'. Its <summary> shows the constraintChips array the form already builds for DealReveal (line ~208), e.g. 'Dinner · Up to AED 200 · Within 20 km of JLT', so the defaults stay visible and honest. Remember the last budget, origin and radius in try/catch-wrapped localStorage as a per-viewer convenience. Delete the 9/3/3/1 strip, which HomeExperience's steps list already says. The composer comes out net smaller. (components/StartPlanForm.tsx:268-431. Before the submit button, the signed-in composer asks for about nine things in this order: mode toggle, a 600-char smart-search textarea (listed first), group tabs, category, custom places, a 9/3/3/1 summary strip, 5 budget chips, an origin select, 4 radius chips, a title and 3 deadline chips. Every field already has a valid default (dinner, any budget, anywhere, 20 km, 3 h), so the only thing between the user and a deal is the length of the page.)
- [high/S] Pinterest/Instagram full-bleed photography that degrades into a designed typographic cover rather than an empty box: Frontend. Put a fixed 4:3 media band at the top of OptionCard. If photo_url exists, use next/image plus PhotoCredit (licence obligation). If not, set the venue name in the display serif on the raised surface, the same treatment as PhotoTile, so all three cards keep the same height and the winner-fold animation doesn't jump. Needs no new data, and every venue upgrades automatically when the Places ingestion runs (docs/PLACES_INGESTION_SCOPE.md). The Places key is still the single biggest visual lever and is blocked on the owner. (components/OptionCard.tsx:98-131. The vote card never renders spot.photo_url, so even the 6 photographed venues show as text-only cards in the one screen the whole group looks at. PhotoTile.tsx and card-stack.tsx already do the photo-or-serif treatment.)
- [high/S] Google Maps lists: every place in a list answers 'how far is it for me', not just what it is: Frontend. On the plan page, add a small 'You're coming from' select that reuses DUBAI_ORIGINS and defaults to the plan origin. Remember it per viewer in try/catch localStorage, and never send it to the server. Pass its coordinates to the haversineKm used for distanceKm. Add '≈ N min drive' to the card meta with the same 'rush-hour estimate' label GettingThere uses. The shape is 'from AED 150pp · 9 km · ≈ 25 min drive'. Venues with no coordinates show no travel line, never a guess. (components/OptionCard.tsx:120 (meta line shows only '· N km away') and app/plan/[id]/page.tsx:187, where the distance comes from the HOST's origin. A voter starting from another area gets the host's distance. The drive-time estimate (lib/directions.ts driveMinutesEstimate) only renders after the decision, in GettingThere.tsx:20.)
- [high/M] Google Maps place sheet: 'nearest transit, N min walk' answers 'do I need to drive' at a glance: Data + frontend. Add a static lib/dubai-metro.ts: the Red/Green line stations with coordinates, from a one-off hand-checked pull (static geography, no API). Add a pure nearestStation(lat,lng) that uses haversineKm. In GettingThere, add a line like 'Nearest metro: Business Bay (Red), ~0.6 km, ≈ 8 min walk (straight-line estimate)'. Show it only under 1.5 km; beyond that, say 'No metro within walking distance, drive or taxi'. Put the same one-liner on OptionCard. Leave one assert-style unit test on nearestStation. This answers the owner's 'do I need to take the metro' question honestly without a transit API. (components/vote/GettingThere.tsx:31-46. The only transit answer is an outbound 'Live transit options' link (lib/directions.ts:31). There is no metro data anywhere in lib/ (grep 'metro' only hits the directions.ts comment explaining why RTA's live GTFS isn't usable).)
- [medium/S] Partiful 'Jane and 14 others are going': social proof on the invite, before the friend has committed: Backend-sql. New additive migration: add 'voter_count' (count distinct ballots in the current stage) and, once decided, 'coming_count' (rsvps.choice='coming') to the jsonb. Counts only, no names, because this is shown to non-members. Render 'Aryan's plan · 4 have voted · closes 9pm' on the login card and in the OG footer, and 'Decided · 5 coming' once decided. Omit the phrase at zero rather than showing '0 voted'. The security subagent must review it (a security-definer function readable by non-members), and lib/types.ts needs updating in the same pass. (plan_share_preview (migration 062) returns title/status/stage/deadline/host_first_name/spot_count/event_time/winner. It has no participation signal, so /login?next=/plan/<id> (app/login/page.tsx:23-27) and the OG card (app/plan/[id]/opengraph-image.tsx) can say only the title and 'Tap to vote'.)
- [medium/M] Instagram/TikTok shareable artefact: a 9:16 image made for Stories, not just a link unfurl: Frontend/server. Add app/plan/[id]/story/route.tsx with ImageResponse at 1080x1920, reusing _og/card's OgFrame/NIGHT/ogFonts and fetchPlanSharePreview. It shows the winner name in the serif, area, event time, 'Picked by' initials and the winner photo when photo_url exists. With no photo, the typography carries it, and nothing is invented. In DecidedPlan, add a 'Share to story' button that fetches the PNG and calls navigator.share({files:[File]}), gated on navigator.canShare({files}); where files can't be shared, fall back to a download link. Also pass the photo into the existing OG card's decided branch. (components/ShareActions.tsx and app/plan/[id]/opengraph-image.tsx. The only image today is the 1200x630 text-only OG card, which never uses the winner's photo even when it exists.)
- [medium/S] Beli's post-visit loop: logging the visit is the moment of highest intent and feeds the next decision: Frontend. When now > event_time + 2h, reorder DecidedPlan so RatingSection and an 'Add photos to Been' action (the existing visit_photos upload path in BeenTab/useBeenCollections) come first, and collapse the logistics sections into one line. The 'Your plans' rail (proposal 1) shows 'Rate it' for the same plans. Optional later: after the rating, add one Beli-style pairwise tap, 'Better or worse than <your last rated place>?'. Skip it until ratings have volume. (components/DecidedPlan.tsx:229. RatingSection always renders last, below When/Who's in/Where/Booking, whatever the time. After the night out, the 'How was it?' prompt and the Been-photo upload sit at the bottom of a page built for before the event.)
- [medium/S] Pinterest-style product surface visible before sign-up (browse first, commit later): Frontend. On the signed-out front door, render the same five tab labels in home-nav as links to /demo?view=<tab>. /demo already sets fixtures, and its non-dismissable 'Sample data' banner keeps it honest. A visitor can then see Discover/moodboards/Been before signing in, without fabricated data showing up as their own. Fold this into the in-flight B8 LandingNav on lane/frontend-a rather than building it separately. (components/HomeExperience.tsx:93. `const accountTabs = !demoMode || fixtures` hides the Plan/Discover/Been/Friends/Profile tabs, the search bar and the avatar on the signed-out front door (app/page.tsx:61 passes demoMode without fixtures). That is why the owner sees no tabs, moodboards or collections on the 'Good evening… Dubai plans without the group chat' page. They exist at /home when signed in and at /demo with labelled sample data.)
- [medium/S] TikTok/Tinder single-card tap-to-cycle: the owner explicitly named the moving cards as the part they love: Frontend decision, not code. Don't delete card-stack.tsx in B8. Keep the tap-to-cycle stack as the hero (or beside LiveVoteLoop) and order its deck photo-first, so the photographed venues lead, since the owner's complaint was 'we need the pictures'. That is a one-line sort on spots by photo_url != null before slicing. Reconsider the deletion after the Places key lands. (components/kokonutui/card-stack.tsx (the hero deck). The B8 landing redesign on lane/frontend-a (worklog 'Left:') plans to delete card-stack.tsx and replace it with LiveVoteLoop.)
- [low/S] Friend-graph recap (Instagram/Spotify Wrapped-lite): a relationship number worth coming back to: Frontend (plus server if the count isn't returned). On each plannedWith row, show the count already derivable from getPlannedWith, e.g. 'Sara · 4 plans since July · last: Friday'. If lib/social's PlannedWith lacks the count or date, extend that read to include them. Real data only, and no streak mechanics until a group has at least 3 plans; below that it would be a fake streak. (components/account/FriendsTab.tsx:49. The plannedWith list renders names only. WrappedRecap.tsx already exists on Profile, but the Friends tab gives no reason to open it again.)