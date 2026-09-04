# Graph Report - .  (2026-09-04)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1203 nodes · 1969 edges · 112 communities (91 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 73 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8de54d2e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- createClient
- plan/[id]/page.tsx
- StartPlanForm.tsx
- scripts
- social.ts
- card-stack.tsx
- resolve.ts
- devDependencies
- DemoPlanningTools.tsx
- compilerOptions
- schema.sql
- migration-020-production-security.sql
- plans
- rsvp-rating-upsert-race.dbtest.ts
- Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise
- vote-idempotency.dbtest.ts
- dubai-phase.ts
- build.mjs
- HomeExperience.tsx
- components.json
- Spot
- types.ts
- 4. What to build next, in this order
- spots
- Progressive Pools Plan Format
- AccountViews.tsx
- plan-ind Working Checkpoint
- Security Hardening Pass 2026-08-10
- Resolution pipeline to build next
- scale.mjs
- Supabase Auth Setup
- wrapped.ts
- Competitive landscape
- concurrency.mjs
- privacy/page.tsx
- backend-data Agent
- Four-Table Schema (spots, plans, plan_spots, votes)
- plan-ind Invariants
- Migration Runbook
- Product Strategy: The Group Decision Layer for Going Out
- Seven-Stage Resolution Pipeline
- getSupabaseConfig
- migration-005-social.sql
- migration-012-place-link-imports.sql
- Low-Friction Product Promise (no signup, link in a group chat)
- Luna Smart Search
- Cross-Platform Architecture
- mint-local-users.mjs
- run.mjs
- migration-006-social-hardening.sql
- Decide / Winner Logic
- Browser Realtime Subscription (votes, plans; removeChannel on unmount)
- Frontend Design Standards
- Core differentiators
- Hardcoded #666 Fill Convention
- smoke-test.mjs
- Populated Demo Account Views
- check-schema-types.mjs
- mint-voters.mjs
- Production security setup
- migration-007-auth.sql
- migration-010-recommendations-collections.sql
- migration-018-participant-write-rpcs.sql
- frontend Agent
- Repo State Snapshot
- seed-local-stack.mjs
- use-auto-resize-textarea.ts
- shadcn
- next.config.ts
- set_birth_date
- resolve-aliases.mjs
- The Builder Never Audits Their Own Work
- eslint.config.mjs
- postcss.config.mjs
- Tailwind v4 @theme in globals.css (no tailwind.config.ts)
- people_before_write
- people
- rsvps
- ratings
- rsvps
- people
- auth.users
- mirror_friendship
- people_default_place_collections
- trim_companion_name
- trim_visit_text

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 29 edges
2. `plans` - 23 edges
3. `Spot` - 21 edges
4. `recordSecurityEvent()` - 18 edges
5. `scripts` - 17 edges
6. `compilerOptions` - 17 edges
7. `spots` - 16 edges
8. `validateMutationRequest()` - 15 edges
9. `readJsonBody()` - 14 edges
10. `POST()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Layout` --semantically_similar_to--> `Cross-Platform Architecture`  [INFERRED] [semantically similar]
  FRONTEND_DESIGN_STANDARDS.md → PRODUCT_STRATEGY.md
- `Constraint-Aware Three, Never a Feed` --semantically_similar_to--> `Luna Smart Search`  [INFERRED] [semantically similar]
  PRODUCT_STRATEGY.md → CHECKPOINT.md
- `SSRF and Untrusted-Input Rules` --semantically_similar_to--> `Host Token Isolation (plan_host_tokens)`  [INFERRED] [semantically similar]
  PLACE_IMPORT_ARCHITECTURE.md → worklog.md
- `Plan / Discover / Been / Friends / Profile IA` --implements--> `Layout`  [INFERRED]
  CHECKPOINT.md → FRONTEND_DESIGN_STANDARDS.md
- `Implementation quality` --semantically_similar_to--> `Strategy Anti-Patterns`  [INFERRED] [semantically similar]
  FRONTEND_DESIGN_STANDARDS.md → PRODUCT_STRATEGY.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Participant Identity Hardening Arc** — checkpoint_permissive_shared_link_trust, checkpoint_participant_identity_seam, checkpoint_participant_write_rpcs, worklog_participant_rpc_integrity, worklog_smoke_test_guards [EXTRACTED 1.00]
- **Move the Secret Out of Client Reach** — worklog_host_token_isolation, worklog_member_ages_dob_record, worklog_legacy_write_path_removal, checkpoint_secure_plan_creation, place_import_architecture_ssrf_rules [INFERRED 0.85]
- **Three-Pool Group Decision Flow** — checkpoint_progressive_pools, checkpoint_host_command_security, checkpoint_rsvp_choices, product_strategy_decision_protocol, product_strategy_constraint_aware_three [INFERRED 0.85]
- **Demo Account Venue Photography Set (Dubai, Four Categories)** — public_demo_al_qudra_morning_photo, public_demo_alserkal_dinner_photo, public_demo_beach_club_photo, public_demo_padel_night_photo [INFERRED 0.95]
- **Time-of-Day Spread Across Demo Cards (Dawn, Midday, Dusk, Night)** — public_demo_al_qudra_morning_demo_asset_role, public_demo_beach_club_demo_asset_role, public_demo_padel_night_demo_asset_role, public_demo_alserkal_dinner_demo_asset_role [INFERRED 0.75]
- **Plan Activity Categories Depicted (Outdoor Ride, Dinner, Beach Club, Padel)** — public_demo_al_qudra_morning_activity_cycling, public_demo_alserkal_dinner_activity_group_dinner, public_demo_beach_club_activity_daytime_hangout, public_demo_padel_night_activity_booked_slot [INFERRED 0.85]
- **Dubai Venue Locations Implied by the Demo Set** — public_demo_al_qudra_morning_venue_al_qudra_lakes, public_demo_alserkal_dinner_venue_warehouse_courtyard, public_demo_beach_club_venue_palm_beach_club, public_demo_padel_night_venue_padel_court [INFERRED 0.85]
- **Full-Stack Handoff Chain: backend-data to security to frontend to qa-test** — _claude_agents_backend_data_backend_data, _claude_agents_security_security, _claude_agents_frontend_frontend, _claude_agents_qa_test_qa_test, _claude_agents_readme_handoff_flow [EXTRACTED 1.00]
- **Untrusted voter_name Identity: impersonation, normalization, upsert semantics** — _claude_agents_readme_vote_impersonation, _claude_agents_readme_voter_name_not_normalized, _claude_agents_security_self_typed_identity, _claude_agents_frontend_change_your_mind_ui, _claude_agents_qa_test_schema_integration_tests [INFERRED 0.85]
- **Assumptions the Database Does Not Enforce (deadline, exactly-three, status, permissive RLS)** — _claude_agents_readme_decorative_deadline, _claude_agents_readme_exactly_three_options, _claude_agents_readme_permissive_rls_tradeoff, _claude_agents_frontend_dont_imply_unenforced_lock, _claude_agents_readme_cross_plan_reach [INFERRED 0.85]
- **16x16 grey UI icon trio shipped by create-next-app** — public_file_file_icon, public_globe_globe_icon, public_window_window_icon, public_file_currentcolor_free_grey_token [INFERRED 0.85]
- **Untouched create-next-app public/ assets** — public_file_scaffold_icon_set, public_next_next_wordmark, public_vercel_vercel_triangle, public_file_file_icon, public_globe_globe_icon, public_window_window_icon [INFERRED 0.85]

## Communities (112 total, 21 thin omitted)

### Community 0 - "createClient"
Cohesion: 0.07
Nodes (70): authenticatedProfile(), GET(), MAPS_URL(), POST(), POST(), runtime, COMMANDS, PATCH_FIELDS (+62 more)

### Community 1 - "plan/[id]/page.tsx"
Cohesion: 0.05
Nodes (52): Access, closesLabel(), Load, ROMAN, VotePage(), AccountViews(), DecidedPlan(), DecidedPlanProps (+44 more)

### Community 2 - "StartPlanForm.tsx"
Cohesion: 0.07
Nodes (41): CATEGORIES, Category, CATEGORY_GROUPS, GROUP_OF, GroupKey, BUDGETS, DirectPlanForm(), DirectPlanSpot (+33 more)

### Community 3 - "scripts"
Cohesion: 0.05
Nodes (40): clsx, useCopyToClipboard(), motion, next, openai, dependencies, clsx, motion (+32 more)

### Community 4 - "social.ts"
Cohesion: 0.09
Nodes (25): APP_VIEWS, AppView, HomePage(), requireUser(), CompanionInput, Db, getPlannedWith(), getProfileVisits() (+17 more)

### Community 5 - "card-stack.tsx"
Cohesion: 0.09
Nodes (26): Action, ActionSearchBar(), allActionsSample, ANIMATION_VARIANTS, SearchResult, Card(), CardProps, CardStackExample() (+18 more)

### Community 6 - "resolve.ts"
Cohesion: 0.13
Nodes (25): inCidr(), ipToUint32(), isPrivateAddress(), isPrivateIPv4(), isPrivateIPv6(), clueTokens(), matchCandidates(), overlapScore() (+17 more)

### Community 7 - "devDependencies"
Cohesion: 0.06
Nodes (29): autocannon, eslint, eslint-config-next, devDependencies, autocannon, eslint, eslint-config-next, @playwright/test (+21 more)

### Community 8 - "DemoPlanningTools.tsx"
Cohesion: 0.08
Nodes (28): AccountView, CITY_AREAS, DEFAULT_COLLECTIONS, DemoAccountViews(), DemoCollection, FRIENDS, PLACES, VISITS (+20 more)

### Community 9 - "compilerOptions"
Cohesion: 0.06
Nodes (31): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+23 more)

### Community 10 - "schema.sql"
Cohesion: 0.08
Nodes (9): friendships_mirror_del, friendships_mirror_ins, mirror_friendship(), people_default_place_collections(), people_default_place_collections_after_insert, trim_companion_name(), trim_visit_text(), visit_companions_before_write (+1 more)

### Community 11 - "migration-020-production-security.sql"
Cohesion: 0.09
Nodes (20): enforce_plan_membership, member_ages, ord, sanitize_participant_text, app_control_secrets, app_rate_limits, create_secure_plan(), current_member_age() (+12 more)

### Community 12 - "plans"
Cohesion: 0.11
Nodes (22): rsvps, ratings, execute_plan_command(), ranked, cast_plan_vote(), execute_plan_command(), member_ages, plan_host_tokens (+14 more)

### Community 13 - "rsvp-rating-upsert-race.dbtest.ts"
Cohesion: 0.14
Nodes (23): authPrelude(), challenger(), createDecidedPlan(), createOpenPlan(), detectSkip(), errorMessage(), execFileAsync, held() (+15 more)

### Community 14 - "Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise"
Cohesion: 0.10
Nodes (24): Activity: Early Morning Desert Cycling Ride, Demo Asset Role: Outdoor/Morning Card in Discover and Been Views, Group Signal: Three Friends Walking the Shoreline, Picnic Rug and Flask, Al Qudra Morning Photo (Desert Lake at Dawn), Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise, Venue: Al Qudra Lakes / Desert Cycle Track, Activity: Group Dinner (Core Deal Three Use Case), Alcohol Signal: Red Wine Served at Table (+16 more)

### Community 15 - "vote-idempotency.dbtest.ts"
Cohesion: 0.16
Nodes (18): CastVoteResult, authPrelude(), castVote(), castVoteSql(), createPlan(), detectSkip(), errorMessage(), execFileAsync (+10 more)

### Community 16 - "dubai-phase.ts"
Cohesion: 0.18
Nodes (16): display, hanken, metadata, RootLayout(), viewport, ThemeSync(), autoGround(), DAY_FROM_HOUR (+8 more)

### Community 17 - "build.mjs"
Cohesion: 0.13
Nodes (12): CARDS, CSS, OUT, ownerPaletteCard, PALETTE, TOKENS, written, blocks() (+4 more)

### Community 18 - "HomeExperience.tsx"
Cohesion: 0.17
Nodes (13): signOut(), dynamic, APP_VIEWS, AppView, greetingFor(), HomeExperience(), VIEW_LABELS, viewFromParam() (+5 more)

### Community 19 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, registries, @kokonutui (+9 more)

### Community 20 - "Spot"
Cohesion: 0.18
Nodes (14): PhotoTile(), WallNote, COLUMN_OFFSETS, HEIGHTS, WallPhoto, WallPin, WallVisit, DATE_FORMAT (+6 more)

### Community 21 - "types.ts"
Cohesion: 0.12
Nodes (16): CompanionView, Friendship, Person, PlaceCollection, PlaceCollectionItem, PlanStage, PlanStatus, PriceBand (+8 more)

### Community 22 - "4. What to build next, in this order"
Cohesion: 0.12
Nodes (15): 1. Hard rules — do not break these, 2. Verification — run all of these before you say you are done, 3. Traps that have already caused real bugs here, 4.0 Test plans available, 4.1 Verify and refine the phone layout, 4.2 Deploy and verify migration 020, 4.3 Been collections and photos, 4.4 Friends that can actually be added (+7 more)

### Community 23 - "spots"
Cohesion: 0.21
Nodes (15): auth, auth.users, ensure_authenticated_profile(), ensure_authenticated_profile(), friendships, people, place_collection_items, place_collections (+7 more)

### Community 24 - "Progressive Pools Plan Format"
Cohesion: 0.33
Nodes (7): Budget, Origin and Radius Inputs, Progressive Pools Plan Format, Related-Category Dealing Fallback, RSVP Coming / Maybe / Can't Make It, Better Decision Protocol, Group Decision Layer Positioning, Group Fit Score

### Community 25 - "AccountViews.tsx"
Cohesion: 0.14
Nodes (13): AccountView, PlaceCard(), priceLabel(), PhotoWall(), WallItem, addVisitToCollection(), createVisitCollection(), removeVisitFromCollection() (+5 more)

### Community 26 - "plan-ind Working Checkpoint"
Cohesion: 0.14
Nodes (13): Authentication verification, Current state, End of day checkpoint: social place links, Immediate user direction after the latest review, Known risks and constraints, Latest implementation: budget, distance and Been collections, Latest implementation: Luna smart search, Latest implementation: progressive pools + saved custom places (+5 more)

### Community 27 - "Security Hardening Pass 2026-08-10"
Cohesion: 0.22
Nodes (14): Age-Aware Mainstream Catalog, Host-Token Plan Commands, Participant Token Seam, Participant Write RPCs, Saved Custom Places, Secure Server-Side Plan Creation, Security Review P0/P1 Findings, Host Token Isolation (plan_host_tokens) (+6 more)

### Community 28 - "Resolution pipeline to build next"
Cohesion: 0.14
Nodes (13): 1. Intake, 2. Obtain permitted source material, 3. Extract clues, 4. Generate candidates, 5. Resolve confidence, 6. Enrich and reconcile, 7. Present and save, Completion criteria for the first real provider (+5 more)

### Community 29 - "scale.mjs"
Cohesion: 0.32
Nodes (12): apiCall(), loadUsers(), n, planCreateScale(), planSpotMap(), report(), rpc(), rsvpScale() (+4 more)

### Community 30 - "Supabase Auth Setup"
Cohesion: 0.18
Nodes (11): 1. Apply the database migration, 2. Configure email one-time codes, 3. Configure Google, 4. Allow application redirects, 5. Environment variables, Email One-Time Code Sign-In, Public Supabase Environment Shape, Google OAuth Provider Config (+3 more)

### Community 31 - "wrapped.ts"
Cohesion: 0.27
Nodes (8): WrappedSummary, aggregateWrappedSummary(), compareLabels(), mostCommon(), WrappedMonthWindow, WrappedRatingRow, WrappedVisitRow, summary()

### Community 32 - "Competitive landscape"
Cohesion: 0.17
Nodes (12): Apple Invites, Competitive landscape, Coordination after the idea exists, DICE, Discovery and booking, Fluo, Google Maps Group Planning, Howbout (+4 more)

### Community 33 - "concurrency.mjs"
Cohesion: 0.39
Nodes (11): loadVoters(), n, readRows(), report(), rpc(), rsvpCollide(), rsvpContend(), runId (+3 more)

### Community 34 - "privacy/page.tsx"
Cohesion: 0.25
Nodes (8): dynamic, metadata, PrivacyPage(), dynamic, metadata, TermsPage(), getLegalConfig(), LegalConfig

### Community 35 - "backend-data Agent"
Cohesion: 0.36
Nodes (9): backend-data Agent, qa-test Agent, Silent Correctness Failure (a wrong winner throws no error), plan-ind Agent Team (four subagents + orchestrator), File Ownership Map, Default Handoff Flow (backend-data to security to frontend to qa-test), security Agent (audit-only, no write tools), Session Handoff (agent team setup) (+1 more)

### Community 36 - "Four-Table Schema (spots, plans, plan_spots, votes)"
Cohesion: 0.28
Nodes (9): Idempotent spots Seed Data (read-mostly reference data), Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Vote Impersonation via voter_name Upsert, voter_name Not Normalized, Identity Is a Self-Typed String, Ground Truth Read From Code (+1 more)

### Community 37 - "plan-ind Invariants"
Cohesion: 0.22
Nodes (9): No Service-Role Key Exists, Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing, Anon Key Is Designed to Be Public, Blast Radius Beyond a Single Link, Permissive RLS Is Not a Finding, Severity Calibrated to a Social Dinner App (+1 more)

### Community 38 - "Migration Runbook"
Cohesion: 0.40
Nodes (6): Migration 007 Auth Binding, No Legacy Identity Claim, Verification Without a Test Runner, Migration Runbook, schema.sql as End-State, Not Update Path, Smoke-Test Database Guards

### Community 39 - "Product Strategy: The Group Decision Layer for Going Out"
Cohesion: 0.17
Nodes (12): Next.js Breaking-Changes Rule, Targeted Graphify Feature Workflow, Multidimensional Place Taxonomy, Avoid, Constraint-Aware Three, Never a Feed, Recommended Delivery Order, Primary sources reviewed, Product position (+4 more)

### Community 40 - "Seven-Stage Resolution Pipeline"
Cohesion: 0.31
Nodes (9): Social Place Link Import Feature, Migration 012 Place Import Tables, Product goal, Allowlisted Provider Adapter Boundary, Seven-Stage Resolution Pipeline, Screenshot Fallback, Source Freshness and Claim Separation, SSRF and Untrusted-Input Rules (+1 more)

### Community 41 - "getSupabaseConfig"
Cohesion: 0.39
Nodes (5): createClient(), getSupabaseConfig(), updateSession(), config, proxy()

### Community 42 - "migration-005-social.sql"
Cohesion: 0.36
Nodes (7): friendships, friendships_mirror_del, friendships_mirror_ins, people, mirror_friendship, visit_companions, visits

### Community 43 - "migration-012-place-link-imports.sql"
Cohesion: 0.31
Nodes (6): people_default_place_collections_after_insert, place_collection_items, place_collections, place_imports, people, people_default_place_collections

### Community 44 - "Low-Friction Product Promise (no signup, link in a group chat)"
Cohesion: 0.25
Nodes (8): Low-Friction Product Promise (no signup, link in a group chat), Mobile-First 375px and A11y Baseline, Copyable Share Link as the Growth Loop, Parallel Sessions Share Only the Repo, Commit Early (parallel-session safety rule), Working Tree Wipe Incident, plan-ind (Dubai dinner decider), Untouched create-next-app README

### Community 45 - "Luna Smart Search"
Cohesion: 0.18
Nodes (12): Frontend Work Gate, Luna Smart Search, Architectural Ivory / Graphite / Champagne System, Persistent Day/Night Toggle, No Green Glowing Status Lights, Plain Copy, Real Dubai Context, Excluded Standards Sections, No Green Glow Rule (Standards) (+4 more)

### Community 46 - "Cross-Platform Architecture"
Cohesion: 0.25
Nodes (8): Route behavior, Web/PWA plus Future Native Scope, Permissive Shared-Link Trust Model, Cross-Platform Architecture, Design requirements for both, Native mobile, Web Guests, Native Regulars, Web / PWA

### Community 47 - "mint-local-users.mjs"
Cohesion: 0.29
Nodes (6): admin, count, mintOne(), OUT_FILE, sha256hex(), users

### Community 48 - "run.mjs"
Cohesion: 0.25
Nodes (5): args, connections, duration, scenarios, token

### Community 49 - "migration-006-social-hardening.sql"
Cohesion: 0.25
Nodes (4): trim_companion_name, trim_visit_text, visit_companions_before_write, visits_before_write

### Community 50 - "Decide / Winner Logic"
Cohesion: 0.33
Nodes (7): Decide / Winner Logic, Deterministic Tie-Break Rule, Never Weaken a Test or Codify Wrong Behavior, Tally and Tie-Break Unit Tests, Cross-Boundary Request Protocol, Exactly Three Options Is App Logic Only, One Owner Per File

### Community 51 - "Browser Realtime Subscription (votes, plans; removeChannel on unmount)"
Cohesion: 0.29
Nodes (7): Schema Discipline (additive changes, policy comments, publication as access control), Never Imply Enforcement the Server Lacks, Browser Realtime Subscription (votes, plans; removeChannel on unmount), Test Discipline (frozen clock, isolation, await Realtime not sleep, honest failures), Deadline Is Decorative (unenforced), schema.sql Drops All Four Tables on Re-Run, Realtime Exposure (Realtime respects RLS, RLS is using(true))

### Community 52 - "Frontend Design Standards"
Cohesion: 0.27
Nodes (9): Components, Frontend Design Standards, Implementation quality, Layout, Motion, Typography, Verification, Strategy Anti-Patterns (+1 more)

### Community 53 - "Core differentiators"
Cohesion: 0.29
Nodes (7): 1. The Group Fit Score, 2. Constraint-aware three, never an infinite feed, 3. A better decision protocol, 4. Live plan resilience, 5. Web guests, native regulars, 6. The memory loop, Core differentiators

### Community 54 - "Hardcoded #666 Fill Convention"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

### Community 56 - "Populated Demo Account Views"
Cohesion: 0.40
Nodes (6): Been Archive Collections, Populated Demo Account Views, Plan / Discover / Been / Friends / Profile IA, Local-First Planning Layer, Planind Wrapped Recap, The Memory Loop

### Community 57 - "check-schema-types.mjs"
Cohesion: 0.33
Nodes (5): missing, NOISE, schema, SERVER_ONLY, types

### Community 58 - "mint-voters.mjs"
Cohesion: 0.33
Nodes (3): count, OUT_FILE, voters

### Community 59 - "Production security setup"
Cohesion: 0.33
Nodes (5): 1. Apply the database boundary, 2. Configure Supabase Auth, 3. Configure Vercel, 4. Operational checks, Production security setup

### Community 60 - "migration-007-auth.sql"
Cohesion: 0.33
Nodes (3): ensure_authenticated_profile(), auth.users, people

### Community 61 - "migration-010-recommendations-collections.sql"
Cohesion: 0.53
Nodes (5): people, visit_collection_items, visit_collections, visit_photos, visits

### Community 62 - "migration-018-participant-write-rpcs.sql"
Cohesion: 0.33
Nodes (4): rate_plan(), set_plan_rsvp(), ratings, rsvps

### Community 63 - "frontend Agent"
Cohesion: 0.40
Nodes (5): Create - Share - Vote - Live Tally - Decided Flow, frontend Agent, Persist voter_name Locally (never ask a returning voter twice), E2E Two-Browser-Context Share-Link Flow, Attacker-Supplied Input Rendered to the Group

### Community 64 - "Repo State Snapshot"
Cohesion: 0.50
Nodes (5): No Test Runner Installed (Vitest/Playwright from scratch), Outstanding Work Items (seed spots, screens, decide logic, test runner, ssr dep), @supabase/ssr Dependency Unused, Serena Project Config (typescript LSP, gitignore-aware indexing), Repo State Snapshot

### Community 65 - "seed-local-stack.mjs"
Cohesion: 0.40
Nodes (4): live, local, planCount, planIds

## Ambiguous Edges - Review These
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to
- `Alcohol Signal: Red Wine Served at Table` → `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`  [AMBIGUOUS]
  public/demo/alserkal-dinner.png · relation: conceptually_related_to

## Knowledge Gaps
- **326 isolated node(s):** `eslintConfig`, `AREA_CENTRES`, `PlanLifecycleStage`, `RsvpChoice`, `MoodboardItem` (+321 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Alcohol Signal: Red Wine Served at Table` and `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `createClient` to `getSupabaseConfig`, `HomeExperience.tsx`, `social.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `Spot` connect `Spot` to `plan/[id]/page.tsx`, `social.ts`, `card-stack.tsx`, `resolve.ts`, `HomeExperience.tsx`, `types.ts`, `AccountViews.tsx`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `Product Strategy: The Group Decision Layer for Going Out` connect `Product Strategy: The Group Decision Layer for Going Out` to `Competitive landscape`, `Core differentiators`, `Cross-Platform Architecture`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `AREA_CENTRES`, `PlanLifecycleStage` to the rest of the system?**
  _326 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06629339305711086 - nodes in this community are weakly interconnected._