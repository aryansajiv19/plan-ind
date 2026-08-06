# Product Strategy: The Group Decision Layer for Going Out

Last updated: 2026-08-06

## Product position

Do not position the product as another directory, invitation maker, calendar, or booking marketplace.

Position it as:

> The fastest way for a group to turn “we should do something” into a plan everyone can actually commit to.

The product spans any hangout category, but its moat is not the number of categories. Its moat is making a high-quality group decision across those categories.

## Competitive landscape

### Coordination after the idea exists

- Partiful: polished invitations, RSVPs, guest interaction, polls, payments, updates, and albums.
- Apple Invites: invitation design, RSVPs, Maps, Weather, shared albums, and playlists.
- Howbout: shared availability, calendars, event chat, feeds, reminders, and RSVPs.

Gap to own: these products become strongest after someone already knows roughly what the event is. Deal/03 should solve the earlier ambiguous moment: what should this exact group do, where, and when?

### Discovery and booking

- Google Maps: enormous inventory, shared lists, collaborative shortlists, voting, maps, routes, and reviews.
- Resy/Beli: restaurant-specific discovery, taste, lists, recommendations, and reservations.
- DICE/Fever: personalized ticketed event discovery and booking.
- Simpleisure: broad Dubai leisure discovery, booking, sharing, and split payment.
- SCNE: Dubai lifestyle discovery across 50+ experience categories with in-app booking and communities.
- Fluo: UAE sports venues, real-time availability, bookings, games, and player communities.

Gap to own: discovery products optimize for an individual browsing inventory. They tend to create more options. Deal/03 should optimize for group fit, constraint satisfaction, and closure.

## Core differentiators

### 1. The Group Fit Score

Rank options for the group, not for the loudest member or the plan creator. Learn:

- category and vibe preferences;
- budget comfort;
- travel tolerance and starting areas;
- food/diet/accessibility requirements;
- indoor/outdoor and weather tolerance;
- timing habits;
- places visited, liked, rejected, or overused;
- which compromises each person made recently.

Explain every candidate succinctly: “Works for 5/6, open at 9:30, 18 minutes average travel, within everyone’s budget.”

### 2. Constraint-aware three, never an infinite feed

Let users ask naturally:

> “Something outdoors after 7 for six people, under AED 250 each, halfway between Marina and Downtown, not too loud.”

Convert that into structured constraints and return three credible choices across the full hangout catalog. The anti-feed is a feature: the product reduces choice instead of manufacturing more browsing.

### 3. A better decision protocol

Go beyond simple likes:

- private preference capture before showing totals;
- ranked choices or “yes / okay / veto”;
- deal-breakers separated from preferences;
- deterministic tie-breaking;
- an optional “decide for us” mode;
- fairness memory so one person or category does not always win;
- a deadline that actually closes server-side.

### 4. Live plan resilience

The winning plan should remain useful after the vote:

- availability and opening-hours rechecks;
- traffic/travel-time warnings;
- weather suitability;
- reservation or ticket deep links;
- automatic fallback to option two if the winner becomes unavailable;
- reminders based on departure time, not only event time.

“Your beach plan is now poor because wind increased; switch to the saved indoor fallback?” is more valuable than another discovery feed.

### 5. Web guests, native regulars

The share link must remain excellent without installation or account creation. Guests should vote in seconds on any phone.

The native app earns installation through:

- saved friend groups and group taste;
- contacts and calendar integration;
- location-aware travel estimates;
- push notifications and deadline reminders;
- saved places and visit history;
- fast repeat planning;
- camera/photos and post-hangout memories.

### 6. The memory loop

After a hangout, capture lightweight feedback:

- went / skipped;
- worth repeating;
- actual spend;
- vibe accuracy;
- group photos;
- who attended.

Use that data to improve the next three options. The product becomes more valuable each time the same group uses it.

## Universal hangout model

Avoid one flat category enum. Model a hangout across independent dimensions:

- **Format:** dining, cafe, nightlife, beach, sport, wellness, culture, entertainment, outdoors, shopping, gaming, at-home, class/workshop, day trip, ticketed event.
- **Energy:** quiet, social, active, celebratory, romantic, competitive, spontaneous, family-friendly.
- **Environment:** indoor/outdoor, weather-sensitive, seated, accessible, alcohol/no-alcohol.
- **Commercial shape:** free, walk-in, reservation, court/slot booking, ticket, minimum spend, membership.
- **Context:** group size, time, duration, areas, travel mode, budget, age restrictions, dietary/accessibility requirements.

A padel court and a beach club differ operationally, but both can use one canonical `place/experience + availability + booking option + constraints` model.

## Cross-platform architecture

### Web / PWA

- acquisition and SEO;
- public share links;
- instant guest voting;
- desktop planning;
- graceful installable PWA experience;
- responsive layouts from 320px through wide desktop.

### Native mobile

Use Expo/React Native when App Store and Play Store distribution begins. Share:

- Supabase backend and auth;
- generated database types;
- domain rules and validation;
- recommendation/decision engine;
- design tokens;
- analytics event names.

Build native navigation, interactions, notifications, contacts, calendar, and location separately. Do not ship the Next.js UI inside a generic webview and call it native.

### Design requirements for both

- mobile-first information hierarchy, then intentional desktop composition;
- minimum 44–48px touch targets;
- safe-area and virtual-keyboard handling;
- no hover-only controls;
- responsive typography rather than desktop scaling;
- reduced-motion support;
- fast loading under mobile network conditions;
- consistent tokens, not necessarily pixel-identical layouts.

## Recommended delivery order

1. Secure auth and excellent no-install share voting.
2. Canonical place/experience taxonomy covering all hangout types.
3. Structured constraint capture and search.
4. Group Fit Score and explainable three-option shortlist.
5. Real availability/booking handoffs for selected providers.
6. Saved groups, history, and preference learning.
7. Native Expo client with notifications, contacts, calendar, and location.
8. Live fallback monitoring, payments, and deeper booking integrations.

## Avoid

- an infinite generic venue feed;
- launching dozens of categories with shallow or stale data;
- forcing every voter to install or register;
- building another group chat;
- presenting an AI chatbot as the entire interface;
- mixing paid placement into the decision score without explicit labeling;
- owning booking inventory before the decision workflow is excellent;
- building a social feed before repeat planning works.

## Revenue paths that preserve trust

- booking/ticket affiliate revenue after the winner is decided;
- premium group concierge or advanced planning;
- venue tools for availability and offers;
- clearly labeled sponsored candidates that never secretly alter voting or ranking;
- group payment facilitation when operationally ready.

## Primary sources reviewed

- Partiful: https://partiful.com/
- Howbout: https://howbout.app/groups
- Apple Invites: https://support.apple.com/guide/apple-invites/what-is-apple-invites-dev5266f8d6d/ios
- Google Maps group planning: https://blog.google/products-and-platforms/products/maps/all-together-now-group-planning-google-maps/
- Resy Discover: https://blog.resy.com/newsroom/resy-launches-discover-tab/
- DICE: https://dicefm.zendesk.com/hc/en-gb/articles/22365422759313-Getting-started-with-DICE
- Simpleisure: https://simpleisure.com/
- SCNE: https://scne.ai/
- Fluo: https://www.myfluo.com/
