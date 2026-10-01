# Group preferences: the place that works for everyone

Owner decision 2026-10-01 (see docs/PRODUCT_THESIS.md). Today the host alone sets
kind of night, budget and area, and nine places are dealt at plan creation. The
real argument in a chat is that everyone wants something different. New flow:

1. **Host** picks the kind of night and shares the link. No budget or place yet.
2. **Each friend** (and the host) answers three quick taps in about 10 seconds.
3. **Host taps "Deal for the group".** The app deals nine places that fit
   everyone, and each card says why ("Fits all 5: up to AED 150, 12 km for all").
4. Voting then runs exactly as today (3 rounds of 3, then the final).

"Skip, deal with my settings" stays: the old behaviour is the fallback.

## What a friend answers (all optional, "Any" is a valid answer)

| Tap | Values | Stored as |
|---|---|---|
| Budget comfort | Up to AED 100 / 200 / 350 / Any | `budget_cap` int or null (same ladder as `DEAL_BUDGET_OPTIONS`, lib/spots/match.ts) |
| Coming from | one of `DUBAI_ORIGINS` (lib/dubai-areas.ts) incl. "Anywhere" | `origin_value` text + lat/lng from the table (never free text) |
| Vibe (pick up to 2) | the existing vibe vocabulary used by plans.vibe_preferences (lib/ai/intent.ts) | `vibes text[]` (<= 2) |
| Avoid (optional, up to 2) | the existing avoid vocabulary (plans.avoid_preferences) | `avoid text[]` (<= 2) |

## Schema (staged migration, NEVER applied by a lane; the owner approves the apply)

- `plans.stage` check gains `'gathering'` (no spots yet). New `plans.group_summary jsonb null`
  (what the deal used: cap, centroid, n answered, relaxations) for the "fits" copy.
- `plan_preferences(plan_id uuid fk plans on delete cascade, user_id uuid fk auth.users on delete cascade,
  voter_name text not null, budget_cap int null check (0..10000), origin_value text null, origin_latitude float8 null,
  origin_longitude float8 null, vibes text[] not null default '{}' check (cardinality <= 2),
  avoid text[] not null default '{}' check (cardinality <= 2), updated_at timestamptz default now(),
  primary key (plan_id, user_id))`.
- RLS: members of the plan (same `plan_access` rule as votes) can SELECT all rows of their plan; **no direct write
  policy** (house rule). Added to the Realtime publication so "3 of 5 answered" is live.
- RPCs (security definer, membership-checked, validated, idempotent):
  - `create_gathering_plan(p_plan jsonb) returns jsonb {id, hostToken}`: host account only (not anonymous), stage
    `'gathering'`, `pool_count` 3, no `plan_spots`; same quota/cap as `create_secure_plan` (087).
  - `set_plan_preferences(p_plan_id uuid, p_budget_cap int, p_origin_value text, p_vibes text[], p_avoid text[])`:
    member of a plan in stage `'gathering'` only; upserts the caller's row; `voter_name` comes from the server
    (people.display_name), never the body; origin coordinates are looked up server-side from the allowed list.
  - `start_group_plan(p_plan_id uuid, p_spot_ids uuid[], p_group jsonb)`: **host only**, stage must be `'gathering'`,
    exactly 9 distinct curated spots (the route re-checks the photo rule with `photoCheck`), writes `plan_spots`
    (pools 1-3), sets `stage='pool'`, `budget_per_person`, origin and `group_summary`.
- `lib/types.ts` mirrors schema.sql (`npm run check:schema`).

## Deal logic (pure, no DB; lib/group-prefs.ts, reuses `dealFromPool` + its `SpotAffinity` hook in lib/spots/match.ts)

```ts
export interface GroupPref { name: string; budgetCap: number | null; origin: { value: string; latitude: number; longitude: number } | null; vibes: string[]; avoid: string[] }
export interface GroupSummary { answered: number; budgetCap: number | null; centroid: { latitude: number; longitude: number } | null; relaxed: ("budget" | "distance")[] }
export function summariseGroup(prefs: GroupPref[]): GroupSummary
export function groupConstraints(prefs: GroupPref[]): DealConstraints   // budgetPerPerson = lowest cap, origin = fair point
export function groupAffinity(prefs: GroupPref[]): SpotAffinity         // fairness (low max distance), vibe overlap, avoid penalty
export function fitFor(spot: DealSpotRow, prefs: GroupPref[]): string[] // <= 3 short strings for the card
```

Rules: budget = the **lowest** cap in the group (nobody pays more than they said); if fewer than 9 eligible, relax
step by step (second-lowest cap, then wider radius) and record it in `relaxed`; "fair point" minimises the **maximum**
travel for anyone, not the average; `avoid` is a hard exclusion only when 2+ people share it, else a penalty; vibes
are a soft boost. Everything deterministic (seeded) so a refresh never reshuffles. Same age rules as today.

## API

- `POST /api/plans/gathering`: auth + `plan-create` quota like /api/plans; body `{ title, category }`; returns `{ id, hostToken }`.
- `POST /api/plans/[id]/preferences`: member; Turnstile not needed (already signed in); calls `set_plan_preferences`.
- `POST /api/plans/[id]/deal`: host only; reads prefs, runs `dealForGroup`, `photoCheck`, `start_group_plan`; 409 if not gathering;
  503 on any read failure (never a silent partial deal); returns 200 `{ ok }` and the plan reloads over Realtime.

## UI

- Composer: "Ask the group first" is the default; kind of night + Share; budget/radius/origin stay under "Tune it" for the skip path.
- `/plan/[id]` in stage `gathering` (components/vote/Gathering.tsx): a **Prefs card** (3 taps, 44px targets, Save), then
  "You're in. 3 of 5 have answered" with names (answered = filled seat, same seat language as votes); host sees
  **Deal for the group** (enabled at 2+ answers, with "Deal anyway" copy below that) and **Skip, use my settings**.
- OptionCard: one line from `fitFor` (replaces the generic reason chips when `group_summary` exists).
- Decided screen and everything after: unchanged.

## States that must be designed and tested

gathering with 0/1/many answers; a late joiner after the deal (just votes); host deals twice (409, no-op); nobody
answered (host can still deal with own settings); one answer only; relaxations shown honestly ("Nobody is over AED
200; widened to 25 km"); guest members (lane/guest-vote) use the same RPCs; age-gated categories keep today's rules.

## Out of scope

Per-person private answers (answers are visible to the group: they are friends); ranking by past ratings;
payments; changing prefs after the deal (re-deal is a later feature).
