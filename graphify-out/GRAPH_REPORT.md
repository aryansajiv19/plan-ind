# Graph Report - plan-ind  (2026-08-19)

## Corpus Check
- 103 files · ~398,236 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 795 nodes · 1246 edges · 68 communities (56 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8d5ecac6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types.ts
- [id]/page.tsx
- social.ts
- devDependencies
- createClient
- migration-020-production-security.sql
- compilerOptions
- Product Strategy: The Group Decision Layer for Going Out
- layout.tsx
- Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise
- Supabase Auth Setup
- schema.sql
- DemoPlanningTools.tsx
- plans
- plan-ind Working Checkpoint
- Resolution pipeline to build next
- people
- migration-012-place-link-imports.sql
- people_before_write
- Security Hardening Pass 2026-08-10
- migration-005-social.sql
- Seven-Stage Resolution Pipeline
- backend-data Agent
- Four-Table Schema (spots, plans, plan_spots, votes)
- plan-ind Invariants
- Migration Runbook
- Frontend Design Standards
- Low-Friction Product Promise (no signup, link in a group chat)
- Visual direction
- Luna Smart Search
- migration-006-social-hardening.sql
- Decide / Winner Logic
- Browser Realtime Subscription (votes, plans; removeChannel on unmount)
- Hardcoded #666 Fill Convention
- migration-018-participant-write-rpcs.sql
- frontend Agent
- Repo State Snapshot
- Cross-Platform Architecture
- smoke-test.mjs
- visit_companions_before_write
- migration-007-auth.sql
- 4. What to build next, in this order
- The Builder Never Audits Their Own Work
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- Tailwind v4 @theme in globals.css (no tailwind.config.ts)
- Competitive landscape
- people
- getLegalConfig
- migration-019-secret-isolation-and-rpc-integrity.sql
- Production security setup
- migration-010-recommendations-collections.sql
- rsvps
- ratings
- rsvps

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 24 edges
2. `plans` - 20 edges
3. `compilerOptions` - 17 edges
4. `spots` - 15 edges
5. `recordSecurityEvent()` - 14 edges
6. `POST()` - 13 edges
7. `plan-ind Working Checkpoint` - 13 edges
8. `Competitive landscape` - 13 edges
9. `Spot` - 12 edges
10. `Supabase Auth Setup` - 12 edges

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

## Communities (68 total, 12 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.05
Nodes (57): AccountView, AccountViews(), DATE_FORMAT, PlaceCard(), priceLabel(), DecidedPlan(), DecidedPlanProps, prettyTime() (+49 more)

### Community 1 - "[id]/page.tsx"
Cohesion: 0.08
Nodes (36): Access, closesLabel(), Load, VotePage(), NameGate(), NameGateProps, BUDGETS, CATEGORIES (+28 more)

### Community 2 - "social.ts"
Cohesion: 0.07
Nodes (32): AuthProfileBridge(), AVATAR_COLORS, AVATAR_EMOJI, cacheMe(), DeviceProfile, getMe(), newPersonId(), pick() (+24 more)

### Community 3 - "devDependencies"
Cohesion: 0.05
Nodes (40): eslint, eslint-config-next, next, openai, dependencies, next, openai, react (+32 more)

### Community 4 - "createClient"
Cohesion: 0.06
Nodes (61): authenticatedProfile(), GET(), POST(), COMMANDS, PATCH_FIELDS, POST(), runtime, POST() (+53 more)

### Community 5 - "migration-020-production-security.sql"
Cohesion: 0.10
Nodes (17): enforce_plan_membership, sanitize_participant_text, app_control_secrets, app_rate_limits, claim_plan_access(), ensure_authenticated_profile(), plan_access, ratings_require_plan_access (+9 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 7 - "Product Strategy: The Group Decision Layer for Going Out"
Cohesion: 0.14
Nodes (13): 1. The Group Fit Score, 2. Constraint-aware three, never an infinite feed, 3. A better decision protocol, 4. Live plan resilience, 5. Web guests, native regulars, 6. The memory loop, Avoid, Core differentiators (+5 more)

### Community 8 - "layout.tsx"
Cohesion: 0.33
Nodes (4): display, hanken, metadata, viewport

### Community 9 - "Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise"
Cohesion: 0.10
Nodes (24): Activity: Early Morning Desert Cycling Ride, Demo Asset Role: Outdoor/Morning Card in Discover and Been Views, Group Signal: Three Friends Walking the Shoreline, Picnic Rug and Flask, Al Qudra Morning Photo (Desert Lake at Dawn), Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise, Venue: Al Qudra Lakes / Desert Cycle Track, Activity: Group Dinner (Core Deal Three Use Case), Alcohol Signal: Red Wine Served at Table (+16 more)

### Community 10 - "Supabase Auth Setup"
Cohesion: 0.11
Nodes (19): 1. Apply the database migration, 2. Configure email one-time codes, 3. Configure Google, 4. Allow application redirects, 5. Environment variables, Email One-Time Code Sign-In, Public Supabase Environment Shape, Google OAuth Provider Config (+11 more)

### Community 11 - "schema.sql"
Cohesion: 0.07
Nodes (7): friendships_mirror_del, friendships_mirror_ins, people_default_place_collections_after_insert, mirror_friendship, people_default_place_collections, trim_visit_text, visits_before_write

### Community 12 - "DemoPlanningTools.tsx"
Cohesion: 0.09
Nodes (27): AccountView, CITY_AREAS, DEFAULT_COLLECTIONS, DemoAccountViews(), DemoCollection, FRIENDS, PLACES, VISITS (+19 more)

### Community 13 - "plans"
Cohesion: 0.18
Nodes (16): auth, rsvps, ratings, execute_plan_command(), ranked, cast_plan_vote(), execute_plan_command(), plan_host_tokens (+8 more)

### Community 14 - "plan-ind Working Checkpoint"
Cohesion: 0.14
Nodes (13): Authentication verification, Current state, End of day checkpoint: social place links, Immediate user direction after the latest review, Known risks and constraints, Latest implementation: budget, distance and Been collections, Latest implementation: Luna smart search, Latest implementation: progressive pools + saved custom places (+5 more)

### Community 15 - "Resolution pipeline to build next"
Cohesion: 0.14
Nodes (13): 1. Intake, 2. Obtain permitted source material, 3. Extract clues, 4. Generate candidates, 5. Resolve confidence, 6. Enrich and reconcile, 7. Present and save, Completion criteria for the first real provider (+5 more)

### Community 16 - "people"
Cohesion: 0.25
Nodes (11): ensure_authenticated_profile(), friendships, people, place_collection_items, place_collections, place_imports, visit_collection_items, visit_collections (+3 more)

### Community 17 - "migration-012-place-link-imports.sql"
Cohesion: 0.31
Nodes (6): people_default_place_collections_after_insert, place_collection_items, place_collections, place_imports, people, people_default_place_collections

### Community 19 - "Security Hardening Pass 2026-08-10"
Cohesion: 0.18
Nodes (17): Route behavior, Age-Aware Mainstream Catalog, Host-Token Plan Commands, Participant Token Seam, Participant Write RPCs, Permissive Shared-Link Trust Model, Progressive Pools Plan Format, Saved Custom Places (+9 more)

### Community 20 - "migration-005-social.sql"
Cohesion: 0.36
Nodes (7): friendships, friendships_mirror_del, friendships_mirror_ins, people, mirror_friendship, visit_companions, visits

### Community 21 - "Seven-Stage Resolution Pipeline"
Cohesion: 0.21
Nodes (12): Social Place Link Import Feature, First Provider Completion Criteria, Confidence-Gated Confirmation, Migration 012 Place Import Tables, Never Let an LLM Invent the Venue, Product goal, Allowlisted Provider Adapter Boundary, Seven-Stage Resolution Pipeline (+4 more)

### Community 22 - "backend-data Agent"
Cohesion: 0.36
Nodes (9): backend-data Agent, qa-test Agent, Silent Correctness Failure (a wrong winner throws no error), plan-ind Agent Team (four subagents + orchestrator), File Ownership Map, Default Handoff Flow (backend-data to security to frontend to qa-test), security Agent (audit-only, no write tools), Session Handoff (agent team setup) (+1 more)

### Community 23 - "Four-Table Schema (spots, plans, plan_spots, votes)"
Cohesion: 0.28
Nodes (9): Idempotent spots Seed Data (read-mostly reference data), Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Vote Impersonation via voter_name Upsert, voter_name Not Normalized, Identity Is a Self-Typed String, Ground Truth Read From Code (+1 more)

### Community 24 - "plan-ind Invariants"
Cohesion: 0.22
Nodes (9): No Service-Role Key Exists, Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing, Anon Key Is Designed to Be Public, Blast Radius Beyond a Single Link, Permissive RLS Is Not a Finding, Severity Calibrated to a Social Dinner App (+1 more)

### Community 25 - "Migration Runbook"
Cohesion: 0.33
Nodes (7): Next.js Breaking-Changes Rule, Targeted Graphify Feature Workflow, Verification Without a Test Runner, Migration Runbook, Next-Agent Start Order, schema.sql as End-State, Not Update Path, Smoke-Test Database Guards

### Community 26 - "Frontend Design Standards"
Cohesion: 0.27
Nodes (9): Components, Frontend Design Standards, Implementation quality, Layout, Motion, Typography, Verification, Strategy Anti-Patterns (+1 more)

### Community 27 - "Low-Friction Product Promise (no signup, link in a group chat)"
Cohesion: 0.25
Nodes (8): Low-Friction Product Promise (no signup, link in a group chat), Mobile-First 375px and A11y Baseline, Copyable Share Link as the Growth Loop, Parallel Sessions Share Only the Repo, Commit Early (parallel-session safety rule), Working Tree Wipe Incident, plan-ind (Dubai dinner decider), Untouched create-next-app README

### Community 28 - "Visual direction"
Cohesion: 0.29
Nodes (8): Frontend Work Gate, Architectural Ivory / Graphite / Champagne System, Persistent Day/Night Toggle, No Green Glowing Status Lights, Plain Copy, Real Dubai Context, Excluded Standards Sections, No Green Glow Rule (Standards), Visual direction

### Community 29 - "Luna Smart Search"
Cohesion: 0.22
Nodes (11): Budget, Origin and Radius Inputs, Luna Smart Search, Multidimensional Place Taxonomy, Related-Category Dealing Fallback, RSVP Coming / Maybe / Can't Make It, Constraint-Aware Three, Never a Feed, Better Decision Protocol, Recommended Delivery Order (+3 more)

### Community 30 - "migration-006-social-hardening.sql"
Cohesion: 0.25
Nodes (4): trim_companion_name, trim_visit_text, visit_companions_before_write, visits_before_write

### Community 31 - "Decide / Winner Logic"
Cohesion: 0.33
Nodes (7): Decide / Winner Logic, Deterministic Tie-Break Rule, Never Weaken a Test or Codify Wrong Behavior, Tally and Tie-Break Unit Tests, Cross-Boundary Request Protocol, Exactly Three Options Is App Logic Only, One Owner Per File

### Community 32 - "Browser Realtime Subscription (votes, plans; removeChannel on unmount)"
Cohesion: 0.29
Nodes (7): Schema Discipline (additive changes, policy comments, publication as access control), Never Imply Enforcement the Server Lacks, Browser Realtime Subscription (votes, plans; removeChannel on unmount), Test Discipline (frozen clock, isolation, await Realtime not sleep, honest failures), Deadline Is Decorative (unenforced), schema.sql Drops All Four Tables on Re-Run, Realtime Exposure (Realtime respects RLS, RLS is using(true))

### Community 33 - "Hardcoded #666 Fill Convention"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

### Community 34 - "migration-018-participant-write-rpcs.sql"
Cohesion: 0.33
Nodes (4): rate_plan(), set_plan_rsvp(), ratings, rsvps

### Community 35 - "frontend Agent"
Cohesion: 0.40
Nodes (5): Create - Share - Vote - Live Tally - Decided Flow, frontend Agent, Persist voter_name Locally (never ask a returning voter twice), E2E Two-Browser-Context Share-Link Flow, Attacker-Supplied Input Rendered to the Group

### Community 36 - "Repo State Snapshot"
Cohesion: 0.50
Nodes (5): No Test Runner Installed (Vitest/Playwright from scratch), Outstanding Work Items (seed spots, screens, decide logic, test runner, ssr dep), @supabase/ssr Dependency Unused, Serena Project Config (typescript LSP, gitignore-aware indexing), Repo State Snapshot

### Community 37 - "Cross-Platform Architecture"
Cohesion: 0.33
Nodes (6): Web/PWA plus Future Native Scope, Cross-Platform Architecture, Design requirements for both, Native mobile, Web Guests, Native Regulars, Web / PWA

### Community 40 - "migration-007-auth.sql"
Cohesion: 0.33
Nodes (3): ensure_authenticated_profile(), auth.users, people

### Community 41 - "4. What to build next, in this order"
Cohesion: 0.12
Nodes (15): 1. Hard rules — do not break these, 2. Verification — run all of these before you say you are done, 3. Traps that have already caused real bugs here, 4.0 Test plans available, 4.1 Verify and refine the phone layout, 4.2 Deploy and verify migration 020, 4.3 Been collections and photos, 4.4 Friends that can actually be added (+7 more)

### Community 47 - "Competitive landscape"
Cohesion: 0.17
Nodes (12): Apple Invites, Competitive landscape, Coordination after the idea exists, DICE, Discovery and booking, Fluo, Google Maps Group Planning, Howbout (+4 more)

### Community 50 - "getLegalConfig"
Cohesion: 0.33
Nodes (6): metadata, PrivacyPage(), metadata, TermsPage(), getLegalConfig(), LegalConfig

### Community 53 - "migration-019-secret-isolation-and-rpc-integrity.sql"
Cohesion: 0.25
Nodes (8): ord, member_ages, rate_plan(), set_birth_date(), set_plan_rsvp(), auth.users, create_secure_plan(), current_member_age()

### Community 54 - "Production security setup"
Cohesion: 0.33
Nodes (5): 1. Apply the database boundary, 2. Configure Supabase Auth, 3. Configure Vercel, 4. Operational checks, Production security setup

### Community 55 - "migration-010-recommendations-collections.sql"
Cohesion: 0.53
Nodes (5): people, visit_collection_items, visit_collections, visit_photos, visits

## Ambiguous Edges - Review These
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to
- `Alcohol Signal: Red Wine Served at Table` → `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`  [AMBIGUOUS]
  public/demo/alserkal-dinner.png · relation: conceptually_related_to

## Knowledge Gaps
- **219 isolated node(s):** `runtime`, `runtime`, `runtime`, `CATEGORIES`, `SmartSearchIntent` (+214 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Alcohol Signal: Red Wine Served at Table` and `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `createClient` to `social.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `plans` connect `plans` to `migration-020-production-security.sql`, `schema.sql`, `people`, `migration-005-social.sql`, `migration-019-secret-isolation-and-rpc-integrity.sql`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Product Strategy: The Group Decision Layer for Going Out` connect `Product Strategy: The Group Decision Layer for Going Out` to `Luna Smart Search`, `Cross-Platform Architecture`, `Competitive landscape`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `runtime`, `runtime`, `runtime` to the rest of the system?**
  _219 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0525879917184265 - nodes in this community are weakly interconnected._