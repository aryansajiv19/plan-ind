# Graph Report - /Users/aryansajiv/plan-ind  (2026-08-06)

## Corpus Check
- Corpus is ~29,422 words - fits in a single context window. You may not need a graph.

## Summary
- 258 nodes · 357 edges · 16 communities (12 shown, 4 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 1% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.8)
- Token cost: 86,338 input · 0 output

## Community Hubs (Navigation)
- Vote Page and Decided UI
- Agent Roles and Product Flow
- TypeScript Config
- Root Layout and Skyline Backdrop
- Social Layer (friends, visits)
- Runtime Dependencies
- Schema, RLS and Identity Risk
- Dev Tooling Dependencies
- Decide Logic and Test Discipline
- Home Page and Spot Dealing
- Device Profile and Avatars
- Next.js Scaffold Icons
- Audit Independence Principle
- ESLint Config
- Next.js Config
- PostCSS Config

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `Spot` - 9 edges
3. `DecidedPlan()` - 7 edges
4. `include` - 7 edges
5. `Default Handoff Flow (backend-data to security to frontend to qa-test)` - 6 edges
6. `backend-data Agent` - 6 edges
7. `Four-Table Schema (spots, plans, plan_spots, votes)` - 6 edges
8. `plan-ind Invariants` - 6 edges
9. `DecidedPlanProps` - 5 edges
10. `googleCalUrl()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Untouched create-next-app README` --conceptually_related_to--> `This Is NOT the Next.js You Know`  [AMBIGUOUS]
  README.md → AGENTS.md
- `Untouched create-next-app README` --semantically_similar_to--> `plan-ind (Dubai dinner decider)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `plan-ind Invariants` --references--> `schema.sql Drops All Four Tables on Re-Run`  [EXTRACTED]
  CLAUDE.md → .claude/agents/README.md
- `Tailwind v4 @theme in globals.css (no tailwind.config.ts)` --conceptually_related_to--> `This Is NOT the Next.js You Know`  [INFERRED]
  .claude/agents/frontend.md → AGENTS.md
- `OptionCardProps` --references--> `Spot`  [EXTRACTED]
  components/OptionCard.tsx → lib/types.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Full-Stack Handoff Chain: backend-data to security to frontend to qa-test** — _claude_agents_backend_data_backend_data, _claude_agents_security_security, _claude_agents_frontend_frontend, _claude_agents_qa_test_qa_test, _claude_agents_readme_handoff_flow [EXTRACTED 1.00]
- **Untrusted voter_name Identity: impersonation, normalization, upsert semantics** — _claude_agents_readme_vote_impersonation, _claude_agents_readme_voter_name_not_normalized, _claude_agents_security_self_typed_identity, _claude_agents_frontend_change_your_mind_ui, _claude_agents_qa_test_schema_integration_tests [INFERRED 0.85]
- **Assumptions the Database Does Not Enforce (deadline, exactly-three, status, permissive RLS)** — _claude_agents_readme_decorative_deadline, _claude_agents_readme_exactly_three_options, _claude_agents_readme_permissive_rls_tradeoff, _claude_agents_frontend_dont_imply_unenforced_lock, _claude_agents_readme_cross_plan_reach [INFERRED 0.85]
- **16x16 grey UI icon trio shipped by create-next-app** — public_file_file_icon, public_globe_globe_icon, public_window_window_icon, public_file_currentcolor_free_grey_token [INFERRED 0.85]
- **Untouched create-next-app public/ assets** — public_file_scaffold_icon_set, public_next_next_wordmark, public_vercel_vercel_triangle, public_file_file_icon, public_globe_globe_icon, public_window_window_icon [INFERRED 0.85]

## Communities (16 total, 4 thin omitted)

### Community 0 - "Vote Page and Decided UI"
Cohesion: 0.09
Nodes (37): closesLabel(), Load, VotePage(), COLORS, ConfettiCanvas, ConfettiHandle, DecidedPlan(), DecidedPlanProps (+29 more)

### Community 1 - "Agent Roles and Product Flow"
Cohesion: 0.10
Nodes (29): backend-data Agent, Create - Share - Vote - Live Tally - Decided Flow, frontend Agent, Low-Friction Product Promise (no signup, link in a group chat), Mobile-First 375px and A11y Baseline, Persist voter_name Locally (never ask a returning voter twice), Copyable Share Link as the Growth Loop, Tailwind v4 @theme in globals.css (no tailwind.config.ts) (+21 more)

### Community 2 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 3 - "Root Layout and Skyline Backdrop"
Cohesion: 0.11
Nodes (19): bricolage, hanken, metadata, box(), burjKhalifa(), dubaiPhase(), FAR_PATHS, NEAR_PATHS (+11 more)

### Community 4 - "Social Layer (friends, visits)"
Cohesion: 0.11
Nodes (12): CompanionInput, getProfileVisits(), getTaggedVisits(), logVisit(), LogVisitInput, normaliseCompanions(), RawCompanion, RawVisit (+4 more)

### Community 5 - "Runtime Dependencies"
Cohesion: 0.10
Nodes (19): next, dependencies, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, name (+11 more)

### Community 6 - "Schema, RLS and Identity Risk"
Cohesion: 0.14
Nodes (18): Idempotent spots Seed Data (read-mostly reference data), No Service-Role Key Exists, Four-Table Schema (spots, plans, plan_spots, votes), Change-Your-Mind Voting UI (upsert, no locked ballot), Real-Supabase Schema Integration Tests (no mocked Postgres), Cross-Plan Reach (unscoped using(true)), Permissive RLS v1 Tradeoff, lib/types.ts and schema.sql Hand-Synced Pairing (+10 more)

### Community 7 - "Dev Tooling Dependencies"
Cohesion: 0.12
Nodes (17): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+9 more)

### Community 8 - "Decide Logic and Test Discipline"
Cohesion: 0.15
Nodes (14): Decide / Winner Logic, Deterministic Tie-Break Rule, Schema Discipline (additive changes, policy comments, publication as access control), Never Imply Enforcement the Server Lacks, Browser Realtime Subscription (votes, plans; removeChannel on unmount), Test Discipline (frozen clock, isolation, await Realtime not sleep, honest failures), Never Weaken a Test or Codify Wrong Behavior, Tally and Tie-Break Unit Tests (+6 more)

### Community 9 - "Home Page and Spot Dealing"
Cohesion: 0.24
Nodes (8): CATEGORIES, CategoryKey, PRESETS, StartPlanForm(), dealThreeForCategory(), shuffle(), getBeen(), supabase

### Community 10 - "Device Profile and Avatars"
Cohesion: 0.31
Nodes (8): AVATAR_COLORS, AVATAR_EMOJI, DeviceProfile, getMe(), newPersonId(), pick(), randomAvatar(), saveMe()

### Community 11 - "Next.js Scaffold Icons"
Cohesion: 0.48
Nodes (7): Hardcoded #666 Fill Convention, File Icon (document with folded corner), create-next-app Default Scaffold Asset Set, Globe Icon (latitude/longitude wireframe sphere), Next.js Wordmark Logo, Vercel Triangle Logomark, Window Icon (browser chrome with three dots)

## Ambiguous Edges - Review These
- `This Is NOT the Next.js You Know` → `Untouched create-next-app README`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `Vercel Triangle Logomark` → `Hardcoded #666 Fill Convention`  [AMBIGUOUS]
  public/vercel.svg · relation: conceptually_related_to

## Knowledge Gaps
- **82 isolated node(s):** `bricolage`, `hanken`, `metadata`, `Load`, `COLORS` (+77 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `This Is NOT the Next.js You Know` and `Untouched create-next-app README`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Vercel Triangle Logomark` and `Hardcoded #666 Fill Convention`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `backend-data Agent` connect `Agent Roles and Product Flow` to `Decide Logic and Test Discipline`, `Schema, RLS and Identity Risk`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `plan-ind Invariants` connect `Schema, RLS and Identity Risk` to `Decide Logic and Test Discipline`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Tooling Dependencies` to `Runtime Dependencies`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `bricolage`, `hanken`, `metadata` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Vote Page and Decided UI` be split into smaller, more focused modules?**
  _Cohesion score 0.08787878787878788 - nodes in this community are weakly interconnected._