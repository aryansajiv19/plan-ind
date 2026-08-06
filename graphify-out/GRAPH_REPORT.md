# Graph Report - plan-ind  (2026-08-07)

## Corpus Check
- 71 files · ~369,105 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 534 nodes · 741 edges · 42 communities (30 shown, 12 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8c3581c6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- types.ts
- backend-data Agent
- compilerOptions
- SkylineBackdrop.tsx
- social.ts
- devDependencies
- Four-Table Schema (spots, plans, plan_spots, votes)
- schema.sql
- createClient
- StartPlanForm.tsx
- Product Strategy: The Group Decision Layer for Going Out
- Hardcoded #666 Fill Convention
- The Builder Never Audits Their Own Work
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- HomeExperience.tsx
- migration-005-social.sql
- Resolution pipeline to build next
- plan-ind Working Checkpoint
- Frontend Design Standards
- Supabase Auth Setup
- migration-012-place-link-imports.sql
- spots
- migration-006-social-hardening.sql
- migration-007-auth.sql
- migration-010-recommendations-collections.sql
- ratings
- rsvps
- spots
- people
- plans
- spots
- plans
- plans
- votes

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `createClient()` - 14 edges
3. `plan-ind Working Checkpoint` - 13 edges
4. `people` - 11 edges
5. `spots` - 10 edges
6. `Product Strategy: The Group Decision Layer for Going Out` - 10 edges
7. `Spot` - 9 edges
8. `dealSpotsForCategory()` - 8 edges
9. `Frontend Design Standards` - 8 edges
10. `Resolution pipeline to build next` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Untouched create-next-app README` --conceptually_related_to--> `This Is NOT the Next.js You Know`  [AMBIGUOUS]
  README.md → AGENTS.md
- `Untouched create-next-app README` --semantically_similar_to--> `plan-ind (Dubai dinner decider)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `plan-ind Invariants` --references--> `schema.sql Drops All Four Tables on Re-Run`  [EXTRACTED]
  CLAUDE.md → .claude/agents/README.md
- `Tailwind v4 @theme in globals.css (no tailwind.config.ts)` --conceptually_related_to--> `This Is NOT the Next.js You Know`  [INFERRED]
  .claude/agents/frontend.md → AGENTS.md
- `POST()` --calls--> `createClient()`  [EXTRACTED]
  app/api/place-import/route.ts → lib/supabase/server.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Full-Stack Handoff Chain: backend-data to security to frontend to qa-test** — _claude_agents_backend_data_backend_data, _claude_agents_security_security, _claude_agents_frontend_frontend, _claude_agents_qa_test_qa_test, _claude_agents_readme_handoff_flow [EXTRACTED 1.00]
- **Untrusted voter_name Identity: impersonation, normalization, upsert semantics** — _claude_agents_readme_vote_impersonation, _claude_agents_readme_voter_name_not_normalized, _claude_agents_security_self_typed_identity, _claude_agents_frontend_change_your_mind_ui, _claude_agents_qa_test_schema_integration_tests [INFERRED 0.85]
- **Assumptions the Database Does Not Enforce (deadline, exactly-three, status, permissive RLS)** — _claude_agents_readme_decorative_deadline, _claude_agents_readme_exactly_three_options, _claude_agents_readme_permissive_rls_tradeoff, _claude_agents_frontend_dont_imply_unenforced_lock, _claude_agents_readme_cross_plan_reach [INFERRED 0.85]
- **16x16 grey UI icon trio shipped by create-next-app** — public_file_file_icon, public_globe_globe_icon, public_window_window_icon, public_file_currentcolor_free_grey_token [INFERRED 0.85]
- **Untouched create-next-app public/ assets** — public_file_scaffold_icon_set, public_next_next_wordmark, public_vercel_vercel_triangle, public_file_file_icon, public_globe_globe_icon, public_window_window_icon [INFERRED 0.85]

## Communities (42 total, 12 thin omitted)

### Community 0 - "types.ts"
Cohesion: 0.07
Nodes (42): Load, COLORS, ConfettiCanvas, ConfettiHandle, DecidedPlan(), DecidedPlanProps, prettyTime(), toLocalInput() (+34 more)

### Community 1 - "backend-data Agent"
Cohesion: 0.06
Nodes (43): backend-data Agent, Decide / Winner Logic, Deterministic Tie-Break Rule, Schema Discipline (additive changes, policy comments, publication as access control), Create - Share - Vote - Live Tally - Decided Flow, Never Imply Enforcement the Server Lacks, frontend Agent, Low-Friction Product Promise (no signup, link in a group chat) (+35 more)

### Community 2 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 3 - "SkylineBackdrop.tsx"
Cohesion: 0.11
Nodes (19): bricolage, hanken, metadata, box(), burjKhalifa(), dubaiPhase(), FAR_PATHS, NEAR_PATHS (+11 more)

### Community 4 - "social.ts"
Cohesion: 0.08
Nodes (24): AVATAR_COLORS, AVATAR_EMOJI, cacheMe(), DeviceProfile, getMe(), newPersonId(), pick(), randomAvatar() (+16 more)

### Community 5 - "devDependencies"
Cohesion: 0.05
Nodes (38): eslint, eslint-config-next, next, openai, dependencies, next, openai, react (+30 more)

### Community 6 - "Four-Table Schema (spots, plans, plan_spots, votes)"
Cohesion: 0.14
Nodes (18): Idempotent spots Seed Data (read-mostly reference data), No Service-Role Key Exists, Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing (+10 more)

### Community 7 - "schema.sql"
Cohesion: 0.10
Nodes (30): people_before_write, ensure_authenticated_profile(), friendships, friendships_mirror_del, friendships_mirror_ins, people, people_before_write(), people_default_place_collections_after_insert (+22 more)

### Community 8 - "createClient"
Cohesion: 0.08
Nodes (32): allowRequest(), CATEGORIES, normalizeIntent(), ORIGINS, POST(), privateIdentifier(), requests, runtime (+24 more)

### Community 9 - "StartPlanForm.tsx"
Cohesion: 0.11
Nodes (25): closesLabel(), VotePage(), BUDGETS, CATEGORIES, Category, CATEGORY_GROUPS, CategoryKey, GroupKey (+17 more)

### Community 10 - "Product Strategy: The Group Decision Layer for Going Out"
Cohesion: 0.09
Nodes (21): 1. The Group Fit Score, 2. Constraint-aware three, never an infinite feed, 3. A better decision protocol, 4. Live plan resilience, 5. Web guests, native regulars, 6. The memory loop, Avoid, Competitive landscape (+13 more)

### Community 11 - "Hardcoded #666 Fill Convention"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

### Community 16 - "HomeExperience.tsx"
Cohesion: 0.09
Nodes (21): POST(), AccountView, CITY_AREAS, DEFAULT_COLLECTIONS, DemoAccountViews(), DemoCollection, FRIENDS, PLACES (+13 more)

### Community 17 - "migration-005-social.sql"
Cohesion: 0.27
Nodes (9): friendships, friendships_mirror_del, friendships_mirror_ins, people, mirror_friendship, plans, spots, visit_companions (+1 more)

### Community 18 - "Resolution pipeline to build next"
Cohesion: 0.13
Nodes (14): 1. Intake, 2. Obtain permitted source material, 3. Extract clues, 4. Generate candidates, 5. Resolve confidence, 6. Enrich and reconcile, 7. Present and save, Completion criteria for the first real provider (+6 more)

### Community 19 - "plan-ind Working Checkpoint"
Cohesion: 0.14
Nodes (13): Authentication verification, Current state, End of day checkpoint: social place links, Immediate user direction after the latest review, Known risks and constraints, Latest implementation: budget, distance and Been collections, Latest implementation: Luna smart search, Latest implementation: progressive pools + saved custom places (+5 more)

### Community 20 - "Frontend Design Standards"
Cohesion: 0.22
Nodes (8): Components, Frontend Design Standards, Implementation quality, Layout, Motion, Typography, Verification, Visual direction

### Community 21 - "Supabase Auth Setup"
Cohesion: 0.25
Nodes (7): 1. Apply the database migration, 2. Configure email one-time codes, 3. Configure Google, 4. Allow application redirects, 5. Environment variables, Route behavior, Supabase Auth Setup

### Community 22 - "migration-012-place-link-imports.sql"
Cohesion: 0.29
Nodes (7): people_default_place_collections_after_insert, place_collection_items, place_collections, place_imports, people, people_default_place_collections, spots

### Community 23 - "spots"
Cohesion: 0.44
Nodes (8): plan_spots, plans, ratings, rsvps, spots, auth, auth.users, votes

### Community 24 - "migration-006-social-hardening.sql"
Cohesion: 0.25
Nodes (4): trim_companion_name, trim_visit_text, visit_companions_before_write, visits_before_write

### Community 25 - "migration-007-auth.sql"
Cohesion: 0.33
Nodes (3): ensure_authenticated_profile(), auth.users, people

### Community 26 - "migration-010-recommendations-collections.sql"
Cohesion: 0.53
Nodes (5): people, visit_collection_items, visit_collections, visit_photos, visits

### Community 27 - "ratings"
Cohesion: 0.50
Nodes (3): ratings, plans, spots

## Ambiguous Edges - Review These
- `This Is NOT the Next.js You Know` → `Untouched create-next-app README`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to

## Knowledge Gaps
- **170 isolated node(s):** `runtime`, `CATEGORIES`, `SmartSearchIntent`, `requests`, `bricolage` (+165 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This Is NOT the Next.js You Know` and `Untouched create-next-app README`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `createClient()` connect `createClient` to `HomeExperience.tsx`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `supabase` connect `social.ts` to `types.ts`, `StartPlanForm.tsx`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `runtime`, `CATEGORIES`, `SmartSearchIntent` to the rest of the system?**
  _170 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07428571428571429 - nodes in this community are weakly interconnected._
- **Should `backend-data Agent` be split into smaller, more focused modules?**
  _Cohesion score 0.06201550387596899 - nodes in this community are weakly interconnected._