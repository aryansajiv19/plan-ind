# Graph Report - .  (2026-08-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 860 nodes · 1367 edges · 76 communities (59 shown, 17 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `67d76a36`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- createClient
- schema.sql
- social.ts
- StartPlanForm.tsx
- scripts
- DemoPlanningTools.tsx
- compilerOptions
- migration-020-production-security.sql
- Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise
- Supabase Auth Setup
- types.ts
- AccountViews.tsx
- Luna Smart Search
- DecidedPlan.tsx
- [id]/page.tsx
- 4. What to build next, in this order
- plan-ind Working Checkpoint
- Resolution pipeline to build next
- HomeExperience.tsx
- Product Strategy: The Group Decision Layer for Going Out
- Security Hardening Pass 2026-08-10
- Competitive landscape
- Frontend Design Standards
- backend-data Agent
- Four-Table Schema (spots, plans, plan_spots, votes)
- plan-ind Invariants
- getLegalConfig
- Cross-Platform Architecture
- migration-005-social.sql
- migration-012-place-link-imports.sql
- Low-Friction Product Promise (no signup, link in a group chat)
- Visual direction
- migration-006-social-hardening.sql
- Decide / Winner Logic
- Browser Realtime Subscription (votes, plans; removeChannel on unmount)
- Participant Write RPCs
- Seven-Stage Resolution Pipeline
- build.mjs
- Hardcoded #666 Fill Convention
- smoke-test.mjs
- layout.tsx
- Production security setup
- migration-007-auth.sql
- migration-010-recommendations-collections.sql
- migration-018-participant-write-rpcs.sql
- frontend Agent
- Repo State Snapshot
- next.config.ts
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
1. `createClient()` - 26 edges
2. `plans` - 20 edges
3. `compilerOptions` - 17 edges
4. `spots` - 15 edges
5. `recordSecurityEvent()` - 14 edges
6. `plan-ind Working Checkpoint` - 13 edges
7. `Competitive landscape` - 13 edges
8. `POST()` - 13 edges
9. `validateMutationRequest()` - 13 edges
10. `Supabase Auth Setup` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Layout` --semantically_similar_to--> `Cross-Platform Architecture`  [INFERRED] [semantically similar]
  FRONTEND_DESIGN_STANDARDS.md → PRODUCT_STRATEGY.md
- `SSRF and Untrusted-Input Rules` --semantically_similar_to--> `Host Token Isolation (plan_host_tokens)`  [INFERRED] [semantically similar]
  PLACE_IMPORT_ARCHITECTURE.md → worklog.md
- `Plan / Discover / Been / Friends / Profile IA` --implements--> `Layout`  [INFERRED]
  CHECKPOINT.md → FRONTEND_DESIGN_STANDARDS.md
- `Implementation quality` --semantically_similar_to--> `Strategy Anti-Patterns`  [INFERRED] [semantically similar]
  FRONTEND_DESIGN_STANDARDS.md → PRODUCT_STRATEGY.md
- `Untouched create-next-app README` --semantically_similar_to--> `plan-ind (Dubai dinner decider)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md

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

## Communities (76 total, 17 thin omitted)

### Community 0 - "createClient"
Cohesion: 0.06
Nodes (72): authenticatedProfile(), GET(), POST(), COMMANDS, PATCH_FIELDS, POST(), runtime, POST() (+64 more)

### Community 1 - "schema.sql"
Cohesion: 0.05
Nodes (43): auth, auth.users, rsvps, ratings, execute_plan_command(), ranked, cast_plan_vote(), execute_plan_command() (+35 more)

### Community 2 - "social.ts"
Cohesion: 0.05
Nodes (42): AVATAR_COLORS, AVATAR_EMOJI, cacheMe(), DeviceProfile, getMe(), newPersonId(), pick(), randomAvatar() (+34 more)

### Community 3 - "StartPlanForm.tsx"
Cohesion: 0.08
Nodes (37): CATEGORIES, Category, CATEGORY_GROUPS, GROUP_OF, GroupKey, BUDGETS, CategoryKey, PRESETS (+29 more)

### Community 4 - "scripts"
Cohesion: 0.05
Nodes (43): eslint, eslint-config-next, next, openai, dependencies, next, openai, react (+35 more)

### Community 5 - "DemoPlanningTools.tsx"
Cohesion: 0.09
Nodes (27): AccountView, CITY_AREAS, DEFAULT_COLLECTIONS, DemoAccountViews(), DemoCollection, FRIENDS, PLACES, VISITS (+19 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (29): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 7 - "migration-020-production-security.sql"
Cohesion: 0.09
Nodes (19): enforce_plan_membership, member_ages, ord, sanitize_participant_text, app_control_secrets, app_rate_limits, claim_plan_access(), create_secure_plan() (+11 more)

### Community 8 - "Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise"
Cohesion: 0.10
Nodes (24): Activity: Early Morning Desert Cycling Ride, Demo Asset Role: Outdoor/Morning Card in Discover and Been Views, Group Signal: Three Friends Walking the Shoreline, Picnic Rug and Flask, Al Qudra Morning Photo (Desert Lake at Dawn), Scene: Bikes Laid on Sand Beside Love Lakes at Sunrise, Venue: Al Qudra Lakes / Desert Cycle Track, Activity: Group Dinner (Core Deal Three Use Case), Alcohol Signal: Red Wine Served at Table (+16 more)

### Community 9 - "Supabase Auth Setup"
Cohesion: 0.11
Nodes (19): 1. Apply the database migration, 2. Configure email one-time codes, 3. Configure Google, 4. Allow application redirects, 5. Environment variables, Email One-Time Code Sign-In, Public Supabase Environment Shape, Google OAuth Provider Config (+11 more)

### Community 10 - "types.ts"
Cohesion: 0.11
Nodes (19): CompanionView, Friendship, Person, PlaceCollection, PlaceCollectionItem, PlaceImport, PlanStage, PlanStatus (+11 more)

### Community 11 - "AccountViews.tsx"
Cohesion: 0.18
Nodes (12): AccountView, AccountViews(), DATE_FORMAT, PlaceCard(), priceLabel(), categoryGroup(), OptionCard(), OptionCardProps (+4 more)

### Community 12 - "Luna Smart Search"
Cohesion: 0.12
Nodes (17): Next.js Breaking-Changes Rule, Budget, Origin and Radius Inputs, Targeted Graphify Feature Workflow, Luna Smart Search, Multidimensional Place Taxonomy, Related-Category Dealing Fallback, Implementation quality, First Provider Completion Criteria (+9 more)

### Community 13 - "DecidedPlan.tsx"
Cohesion: 0.21
Nodes (14): DecidedPlan(), DecidedPlanProps, prettyTime(), toLocalInput(), googleCalUrl(), icsHref(), stamp(), window() (+6 more)

### Community 14 - "[id]/page.tsx"
Cohesion: 0.17
Nodes (12): Access, closesLabel(), Load, ROMAN, VotePage(), NameGateProps, addBeen(), coordinatesForArea() (+4 more)

### Community 15 - "4. What to build next, in this order"
Cohesion: 0.12
Nodes (15): 1. Hard rules — do not break these, 2. Verification — run all of these before you say you are done, 3. Traps that have already caused real bugs here, 4.0 Test plans available, 4.1 Verify and refine the phone layout, 4.2 Deploy and verify migration 020, 4.3 Been collections and photos, 4.4 Friends that can actually be added (+7 more)

### Community 16 - "plan-ind Working Checkpoint"
Cohesion: 0.14
Nodes (13): Authentication verification, Current state, End of day checkpoint: social place links, Immediate user direction after the latest review, Known risks and constraints, Latest implementation: budget, distance and Been collections, Latest implementation: Luna smart search, Latest implementation: progressive pools + saved custom places (+5 more)

### Community 17 - "Resolution pipeline to build next"
Cohesion: 0.14
Nodes (13): 1. Intake, 2. Obtain permitted source material, 3. Extract clues, 4. Generate candidates, 5. Resolve confidence, 6. Enrich and reconcile, 7. Present and save, Completion criteria for the first real provider (+5 more)

### Community 18 - "HomeExperience.tsx"
Cohesion: 0.22
Nodes (9): APP_VIEWS, AppView, DECISION_ROWS, greetingFor(), HomeExperience(), VIEW_LABELS, viewFromParam(), haptic() (+1 more)

### Community 19 - "Product Strategy: The Group Decision Layer for Going Out"
Cohesion: 0.15
Nodes (12): 1. The Group Fit Score, 2. Constraint-aware three, never an infinite feed, 3. A better decision protocol, 4. Live plan resilience, 5. Web guests, native regulars, 6. The memory loop, Avoid, Core differentiators (+4 more)

### Community 20 - "Security Hardening Pass 2026-08-10"
Cohesion: 0.27
Nodes (12): Age-Aware Mainstream Catalog, Host-Token Plan Commands, Progressive Pools Plan Format, Saved Custom Places, Secure Server-Side Plan Creation, Security Review P0/P1 Findings, Host Token Isolation (plan_host_tokens), Legacy Direct-Write Path Removal (+4 more)

### Community 21 - "Competitive landscape"
Cohesion: 0.17
Nodes (12): Apple Invites, Competitive landscape, Coordination after the idea exists, DICE, Discovery and booking, Fluo, Google Maps Group Planning, Howbout (+4 more)

### Community 22 - "Frontend Design Standards"
Cohesion: 0.25
Nodes (10): Verification Without a Test Runner, Components, Frontend Design Standards, Layout, Motion, Typography, Verification, Migration Runbook (+2 more)

### Community 23 - "backend-data Agent"
Cohesion: 0.36
Nodes (9): backend-data Agent, qa-test Agent, Silent Correctness Failure (a wrong winner throws no error), plan-ind Agent Team (four subagents + orchestrator), File Ownership Map, Default Handoff Flow (backend-data to security to frontend to qa-test), security Agent (audit-only, no write tools), Session Handoff (agent team setup) (+1 more)

### Community 24 - "Four-Table Schema (spots, plans, plan_spots, votes)"
Cohesion: 0.28
Nodes (9): Idempotent spots Seed Data (read-mostly reference data), Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Vote Impersonation via voter_name Upsert, voter_name Not Normalized, Identity Is a Self-Typed String, Ground Truth Read From Code (+1 more)

### Community 25 - "plan-ind Invariants"
Cohesion: 0.22
Nodes (9): No Service-Role Key Exists, Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing, Anon Key Is Designed to Be Public, Blast Radius Beyond a Single Link, Permissive RLS Is Not a Finding, Severity Calibrated to a Social Dinner App (+1 more)

### Community 26 - "getLegalConfig"
Cohesion: 0.33
Nodes (6): metadata, PrivacyPage(), metadata, TermsPage(), getLegalConfig(), LegalConfig

### Community 27 - "Cross-Platform Architecture"
Cohesion: 0.22
Nodes (9): Route behavior, Web/PWA plus Future Native Scope, Participant Token Seam, Permissive Shared-Link Trust Model, Cross-Platform Architecture, Design requirements for both, Native mobile, Web Guests, Native Regulars (+1 more)

### Community 28 - "migration-005-social.sql"
Cohesion: 0.36
Nodes (7): friendships, friendships_mirror_del, friendships_mirror_ins, people, mirror_friendship, visit_companions, visits

### Community 29 - "migration-012-place-link-imports.sql"
Cohesion: 0.31
Nodes (6): people_default_place_collections_after_insert, place_collection_items, place_collections, place_imports, people, people_default_place_collections

### Community 30 - "Low-Friction Product Promise (no signup, link in a group chat)"
Cohesion: 0.25
Nodes (8): Low-Friction Product Promise (no signup, link in a group chat), Mobile-First 375px and A11y Baseline, Copyable Share Link as the Growth Loop, Parallel Sessions Share Only the Repo, Commit Early (parallel-session safety rule), Working Tree Wipe Incident, plan-ind (Dubai dinner decider), Untouched create-next-app README

### Community 31 - "Visual direction"
Cohesion: 0.29
Nodes (8): Frontend Work Gate, Architectural Ivory / Graphite / Champagne System, Persistent Day/Night Toggle, No Green Glowing Status Lights, Plain Copy, Real Dubai Context, Excluded Standards Sections, No Green Glow Rule (Standards), Visual direction

### Community 32 - "migration-006-social-hardening.sql"
Cohesion: 0.25
Nodes (4): trim_companion_name, trim_visit_text, visit_companions_before_write, visits_before_write

### Community 33 - "Decide / Winner Logic"
Cohesion: 0.33
Nodes (7): Decide / Winner Logic, Deterministic Tie-Break Rule, Never Weaken a Test or Codify Wrong Behavior, Tally and Tie-Break Unit Tests, Cross-Boundary Request Protocol, Exactly Three Options Is App Logic Only, One Owner Per File

### Community 34 - "Browser Realtime Subscription (votes, plans; removeChannel on unmount)"
Cohesion: 0.29
Nodes (7): Schema Discipline (additive changes, policy comments, publication as access control), Never Imply Enforcement the Server Lacks, Browser Realtime Subscription (votes, plans; removeChannel on unmount), Test Discipline (frozen clock, isolation, await Realtime not sleep, honest failures), Deadline Is Decorative (unenforced), schema.sql Drops All Four Tables on Re-Run, Realtime Exposure (Realtime respects RLS, RLS is using(true))

### Community 35 - "Participant Write RPCs"
Cohesion: 0.29
Nodes (7): Participant Write RPCs, RSVP Coming / Maybe / Can't Make It, Source Freshness and Claim Separation, Better Decision Protocol, Group Decision Layer Positioning, Live Plan Resilience, Participant RPC Integrity Validation

### Community 36 - "Seven-Stage Resolution Pipeline"
Cohesion: 0.43
Nodes (7): Social Place Link Import Feature, Migration 012 Place Import Tables, Product goal, Allowlisted Provider Adapter Boundary, Seven-Stage Resolution Pipeline, Screenshot Fallback, SSRF and Untrusted-Input Rules

### Community 37 - "build.mjs"
Cohesion: 0.29
Nodes (4): CARDS, CSS, OUT, written

### Community 38 - "Hardcoded #666 Fill Convention"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

### Community 40 - "layout.tsx"
Cohesion: 0.33
Nodes (4): display, hanken, metadata, viewport

### Community 41 - "Production security setup"
Cohesion: 0.33
Nodes (5): 1. Apply the database boundary, 2. Configure Supabase Auth, 3. Configure Vercel, 4. Operational checks, Production security setup

### Community 42 - "migration-007-auth.sql"
Cohesion: 0.33
Nodes (3): ensure_authenticated_profile(), auth.users, people

### Community 43 - "migration-010-recommendations-collections.sql"
Cohesion: 0.53
Nodes (5): people, visit_collection_items, visit_collections, visit_photos, visits

### Community 44 - "migration-018-participant-write-rpcs.sql"
Cohesion: 0.33
Nodes (4): rate_plan(), set_plan_rsvp(), ratings, rsvps

### Community 45 - "frontend Agent"
Cohesion: 0.40
Nodes (5): Create - Share - Vote - Live Tally - Decided Flow, frontend Agent, Persist voter_name Locally (never ask a returning voter twice), E2E Two-Browser-Context Share-Link Flow, Attacker-Supplied Input Rendered to the Group

### Community 46 - "Repo State Snapshot"
Cohesion: 0.50
Nodes (5): No Test Runner Installed (Vitest/Playwright from scratch), Outstanding Work Items (seed spots, screens, decide logic, test runner, ssr dep), @supabase/ssr Dependency Unused, Serena Project Config (typescript LSP, gitignore-aware indexing), Repo State Snapshot

## Ambiguous Edges - Review These
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to
- `Alcohol Signal: Red Wine Served at Table` → `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`  [AMBIGUOUS]
  public/demo/alserkal-dinner.png · relation: conceptually_related_to

## Knowledge Gaps
- **231 isolated node(s):** `NameGateProps`, `eslintConfig`, `AVATAR_COLORS`, `AVATAR_EMOJI`, `AREA_CENTRES` (+226 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Alcohol Signal: Red Wine Served at Table` and `Demo Asset Role: Hero Dinner Imagery for Demo Account Views`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `createClient` to `social.ts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `plans` connect `schema.sql` to `migration-005-social.sql`, `migration-020-production-security.sql`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `Product Strategy: The Group Decision Layer for Going Out` connect `Product Strategy: The Group Decision Layer for Going Out` to `Cross-Platform Architecture`, `Luna Smart Search`, `Competitive landscape`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `NameGateProps`, `eslintConfig`, `AVATAR_COLORS` to the rest of the system?**
  _231 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.0554524840239126 - nodes in this community are weakly interconnected._