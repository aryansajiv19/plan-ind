# Graph Report - .  (2026-08-10)

## Corpus Check
- 70 files · ~381,496 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 713 nodes · 1028 edges · 75 communities (49 shown, 26 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.81)
- Token cost: 137,218 input · 0 output

## Community Hubs (Navigation)
- Shared Voting Page
- Plan and Search API Routes
- Device Profile Identity
- Package Dependencies
- Auth Actions and Host Commands
- Demo Account Views
- TypeScript Config
- Product Strategy and Moat
- Root Layout and Skyline
- Demo Photography Assets
- Supabase Auth Setup Runbook
- Canonical Schema and RPCs
- Local Demo Planning Tools
- Host and Participant Security Migrations
- Checkpoint History
- Place Import Pipeline
- Visit Collections and Photos
- Place Import Tables
- Shared-Link Trust Model
- Security Hardening Concepts
- Social Layer Schema
- Social Link Import Design
- Agent Team Routing
- Voting Identity Weaknesses
- Permissive RLS Invariants
- Verification Workflow
- Frontend Design Standards
- Low-Friction Product Promise
- Visual System Rules
- Recommendation Constraints
- Social Hardening Triggers
- Tally and Tie-Break Rules
- Schema Discipline
- Next.js Scaffold Icons
- Participant Write RPCs
- Create to Decide Flow
- Testing Gaps
- Web and Native Scope
- Smoke Test Guards
- Ratings Migration
- Auth Binding Migration
- Last-Mile Categories Migration
- Audit Independence Principle
- ESLint Config
- Next Config
- PostCSS Config
- Tailwind v4 Theme Location
- spots
- people
- people
- plans
- spots
- people
- plans
- plans
- people
- spots
- auth
- mirror_friendship
- trim_companion_name
- trim_visit_text
- auth
- auth.users
- visits
- votes

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 23 edges
2. `people` - 17 edges
3. `compilerOptions` - 16 edges
4. `plans` - 15 edges
5. `plan-ind Working Checkpoint` - 13 edges
6. `Competitive landscape` - 13 edges
7. `Supabase Auth Setup` - 12 edges
8. `spots` - 12 edges
9. `prohibitedVenueReason()` - 11 edges
10. `Product Strategy: The Group Decision Layer for Going Out` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Layout` --semantically_similar_to--> `Cross-Platform Architecture`  [INFERRED] [semantically similar]
  FRONTEND_DESIGN_STANDARDS.md → PRODUCT_STRATEGY.md
- `Never Let an LLM Invent the Venue` --semantically_similar_to--> `Luna Smart Search`  [INFERRED] [semantically similar]
  PLACE_IMPORT_ARCHITECTURE.md → CHECKPOINT.md
- `SSRF and Untrusted-Input Rules` --semantically_similar_to--> `Host Token Isolation (plan_host_tokens)`  [INFERRED] [semantically similar]
  PLACE_IMPORT_ARCHITECTURE.md → worklog.md
- `Recommended Delivery Order` --semantically_similar_to--> `Next-Agent Start Order`  [INFERRED] [semantically similar]
  PRODUCT_STRATEGY.md → worklog.md
- `Plan / Discover / Been / Friends / Profile IA` --implements--> `Layout`  [INFERRED]
  CHECKPOINT.md → FRONTEND_DESIGN_STANDARDS.md

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

## Communities (75 total, 26 thin omitted)

### Community 0 - "Shared Voting Page"
Cohesion: 0.06
Nodes (49): closesLabel(), Load, VotePage(), COLORS, ConfettiCanvas, ConfettiHandle, DecidedPlan(), DecidedPlanProps (+41 more)

### Community 1 - "Plan and Search API Routes"
Cohesion: 0.07
Nodes (45): allowed(), POST(), requests, runtime, safeIdentifier(), text(), allowRequest(), CATEGORIES (+37 more)

### Community 2 - "Device Profile Identity"
Cohesion: 0.07
Nodes (28): AVATAR_COLORS, AVATAR_EMOJI, cacheMe(), DeviceProfile, getMe(), newPersonId(), pick(), randomAvatar() (+20 more)

### Community 3 - "Package Dependencies"
Cohesion: 0.05
Nodes (39): eslint, eslint-config-next, next, openai, dependencies, next, openai, react (+31 more)

### Community 4 - "Auth Actions and Host Commands"
Cohesion: 0.11
Nodes (26): COMMANDS, POST(), runtime, allowOtp(), appOrigin(), AuthFormState, birthDateFrom(), cleanEmail() (+18 more)

### Community 5 - "Demo Account Views"
Cohesion: 0.09
Nodes (22): POST(), signOut(), AccountView, CITY_AREAS, DEFAULT_COLLECTIONS, DemoAccountViews(), DemoCollection, FRIENDS (+14 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "Product Strategy and Moat"
Cohesion: 0.08
Nodes (25): 1. The Group Fit Score, 2. Constraint-aware three, never an infinite feed, 3. A better decision protocol, 4. Live plan resilience, 5. Web guests, native regulars, 6. The memory loop, Apple Invites, Avoid (+17 more)

### Community 8 - "Root Layout and Skyline"
Cohesion: 0.10
Nodes (19): display, hanken, metadata, box(), burjKhalifa(), dubaiPhase(), FAR_PATHS, NEAR_PATHS (+11 more)

### Community 9 - "Demo Photography Assets"
Cohesion: 0.10
Nodes (24): Activity: Early Morning Desert Cycling Ride, Demo Asset Role: Outdoor/Morning Card in Discover and Been Views, Group Signal: Three Friends Walking the Shoreline, Picnic Rug and Flask, Al Qudra Morning Photo (Desert Lake at Dawn), Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise, Venue: Al Qudra Lakes / Desert Cycle Track, Activity: Group Dinner (Core Deal Three Use Case), Alcohol Signal: Red Wine Served at Table (+16 more)

### Community 10 - "Supabase Auth Setup Runbook"
Cohesion: 0.11
Nodes (19): 1. Apply the database migration, 2. Configure email one-time codes, 3. Configure Google, 4. Allow application redirects, 5. Environment variables, Email One-Time Code Sign-In, Public Supabase Environment Shape, Google OAuth Provider Config (+11 more)

### Community 11 - "Canonical Schema and RPCs"
Cohesion: 0.12
Nodes (11): mirror_friendship, people_before_write, friendships_mirror_del, friendships_mirror_ins, people_before_write(), people_default_place_collections_after_insert, people_default_place_collections, trim_companion_name() (+3 more)

### Community 12 - "Local Demo Planning Tools"
Cohesion: 0.15
Nodes (16): Circle, DEFAULT_CIRCLES, DEFAULT_MOODBOARDS, DEFAULT_PLAN, DemoPlanningTools(), ToolView, LocalPlan, Moodboard (+8 more)

### Community 13 - "Host and Participant Security Migrations"
Cohesion: 0.22
Nodes (14): execute_plan_command(), ranked, cast_plan_vote(), execute_plan_command(), member_ages, plan_host_tokens, rate_plan(), set_birth_date() (+6 more)

### Community 14 - "Checkpoint History"
Cohesion: 0.14
Nodes (13): Authentication verification, Current state, End of day checkpoint: social place links, Immediate user direction after the latest review, Known risks and constraints, Latest implementation: budget, distance and Been collections, Latest implementation: Luna smart search, Latest implementation: progressive pools + saved custom places (+5 more)

### Community 15 - "Place Import Pipeline"
Cohesion: 0.14
Nodes (13): 1. Intake, 2. Obtain permitted source material, 3. Extract clues, 4. Generate candidates, 5. Resolve confidence, 6. Enrich and reconcile, 7. Present and save, Completion criteria for the first real provider (+5 more)

### Community 16 - "Visit Collections and Photos"
Cohesion: 0.22
Nodes (13): auth.users, visit_collection_items, visit_collections, visit_photos, ensure_authenticated_profile(), friendships, people, auth.users (+5 more)

### Community 17 - "Place Import Tables"
Cohesion: 0.21
Nodes (10): auth, people_default_place_collections_after_insert, place_collection_items, place_collections, place_imports, people_default_place_collections, place_collection_items, place_collections (+2 more)

### Community 18 - "Shared-Link Trust Model"
Cohesion: 0.20
Nodes (11): Route behavior, Participant Token Seam, Participant Write RPCs, Permissive Shared-Link Trust Model, Progressive Pools Plan Format, Related-Category Dealing Fallback, RSVP Coming / Maybe / Can't Make It, Source Freshness and Claim Separation (+3 more)

### Community 19 - "Security Hardening Concepts"
Cohesion: 0.29
Nodes (11): Age-Aware Mainstream Catalog, Host-Token Plan Commands, Saved Custom Places, Secure Server-Side Plan Creation, Security Review P0/P1 Findings, Host Token Isolation (plan_host_tokens), Legacy Direct-Write Path Removal, Write-Once member_ages DOB Record (+3 more)

### Community 20 - "Social Layer Schema"
Cohesion: 0.27
Nodes (9): friendships, friendships_mirror_del, friendships_mirror_ins, people, mirror_friendship, plans, spots, visit_companions (+1 more)

### Community 21 - "Social Link Import Design"
Cohesion: 0.27
Nodes (10): Social Place Link Import Feature, First Provider Completion Criteria, Confidence-Gated Confirmation, Migration 012 Place Import Tables, Never Let an LLM Invent the Venue, Product goal, Allowlisted Provider Adapter Boundary, Seven-Stage Resolution Pipeline (+2 more)

### Community 22 - "Agent Team Routing"
Cohesion: 0.36
Nodes (9): backend-data Agent, qa-test Agent, Silent Correctness Failure (a wrong winner throws no error), plan-ind Agent Team (four subagents + orchestrator), File Ownership Map, Default Handoff Flow (backend-data to security to frontend to qa-test), security Agent (audit-only, no write tools), Session Handoff (agent team setup) (+1 more)

### Community 23 - "Voting Identity Weaknesses"
Cohesion: 0.28
Nodes (9): Idempotent spots Seed Data (read-mostly reference data), Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Vote Impersonation via voter_name Upsert, voter_name Not Normalized, Identity Is a Self-Typed String, Ground Truth Read From Code (+1 more)

### Community 24 - "Permissive RLS Invariants"
Cohesion: 0.22
Nodes (9): No Service-Role Key Exists, Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing, Anon Key Is Designed to Be Public, Blast Radius Beyond a Single Link, Permissive RLS Is Not a Finding, Severity Calibrated to a Social Dinner App (+1 more)

### Community 25 - "Verification Workflow"
Cohesion: 0.25
Nodes (9): Next.js Breaking-Changes Rule, Targeted Graphify Feature Workflow, Verification Without a Test Runner, Verification, Migration Runbook, Next-Agent Start Order, Participant RPC Integrity Validation, schema.sql as End-State, Not Update Path (+1 more)

### Community 26 - "Frontend Design Standards"
Cohesion: 0.28
Nodes (8): Components, Frontend Design Standards, Implementation quality, Layout, Motion, Typography, Strategy Anti-Patterns, Trust-Preserving Revenue Paths

### Community 27 - "Low-Friction Product Promise"
Cohesion: 0.25
Nodes (8): Low-Friction Product Promise (no signup, link in a group chat), Mobile-First 375px and A11y Baseline, Copyable Share Link as the Growth Loop, Parallel Sessions Share Only the Repo, Commit Early (parallel-session safety rule), Working Tree Wipe Incident, plan-ind (Dubai dinner decider), Untouched create-next-app README

### Community 28 - "Visual System Rules"
Cohesion: 0.29
Nodes (8): Frontend Work Gate, Architectural Ivory / Graphite / Champagne System, Persistent Day/Night Toggle, No Green Glowing Status Lights, Plain Copy, Real Dubai Context, Excluded Standards Sections, No Green Glow Rule (Standards), Visual direction

### Community 29 - "Recommendation Constraints"
Cohesion: 0.32
Nodes (8): Budget, Origin and Radius Inputs, Luna Smart Search, Multidimensional Place Taxonomy, Constraint-Aware Three, Never a Feed, Recommended Delivery Order, Group Decision Layer Positioning, Group Fit Score, Universal Hangout Model

### Community 30 - "Social Hardening Triggers"
Cohesion: 0.25
Nodes (4): trim_companion_name, trim_visit_text, visit_companions_before_write, visits_before_write

### Community 31 - "Tally and Tie-Break Rules"
Cohesion: 0.33
Nodes (7): Decide / Winner Logic, Deterministic Tie-Break Rule, Never Weaken a Test or Codify Wrong Behavior, Tally and Tie-Break Unit Tests, Cross-Boundary Request Protocol, Exactly Three Options Is App Logic Only, One Owner Per File

### Community 32 - "Schema Discipline"
Cohesion: 0.29
Nodes (7): Schema Discipline (additive changes, policy comments, publication as access control), Never Imply Enforcement the Server Lacks, Browser Realtime Subscription (votes, plans; removeChannel on unmount), Test Discipline (frozen clock, isolation, await Realtime not sleep, honest failures), Deadline Is Decorative (unenforced), schema.sql Drops All Four Tables on Re-Run, Realtime Exposure (Realtime respects RLS, RLS is using(true))

### Community 33 - "Next.js Scaffold Icons"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

### Community 34 - "Participant Write RPCs"
Cohesion: 0.33
Nodes (4): rate_plan(), set_plan_rsvp(), ratings, rsvps

### Community 35 - "Create to Decide Flow"
Cohesion: 0.40
Nodes (5): Create - Share - Vote - Live Tally - Decided Flow, frontend Agent, Persist voter_name Locally (never ask a returning voter twice), E2E Two-Browser-Context Share-Link Flow, Attacker-Supplied Input Rendered to the Group

### Community 36 - "Testing Gaps"
Cohesion: 0.50
Nodes (5): No Test Runner Installed (Vitest/Playwright from scratch), Outstanding Work Items (seed spots, screens, decide logic, test runner, ssr dep), @supabase/ssr Dependency Unused, Serena Project Config (typescript LSP, gitignore-aware indexing), Repo State Snapshot

### Community 37 - "Web and Native Scope"
Cohesion: 0.40
Nodes (5): Web/PWA plus Future Native Scope, Cross-Platform Architecture, Design requirements for both, Native mobile, Web / PWA

### Community 39 - "Ratings Migration"
Cohesion: 0.50
Nodes (3): ratings, plans, spots

## Ambiguous Edges - Review These
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to
- `Alcohol Signal: Red Wine Served at Table` → `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`  [AMBIGUOUS]
  public/demo/alserkal-dinner.png · relation: conceptually_related_to

## Knowledge Gaps
- **201 isolated node(s):** `COLORS`, `ConfettiCanvas`, `SkyPhase`, `PHASE_BOUNDS`, `FAR_PATHS` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Alcohol Signal: Red Wine Served at Table` and `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `Auth Actions and Host Commands` to `Plan and Search API Routes`, `Device Profile Identity`, `Demo Account Views`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `supabase` connect `Device Profile Identity` to `Shared Voting Page`, `Plan and Search API Routes`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Product Strategy: The Group Decision Layer for Going Out` connect `Product Strategy and Moat` to `Recommendation Constraints`, `Web and Native Scope`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `COLORS`, `ConfettiCanvas`, `SkyPhase` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shared Voting Page` be split into smaller, more focused modules?**
  _Cohesion score 0.06110102843315184 - nodes in this community are weakly interconnected._