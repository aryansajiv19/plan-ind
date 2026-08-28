# Priorities

The orchestrator's work queue. Ranked from the audit of 2026-08-28 (graphify +
three parallel explorers). Frontend leads, by owner decision.

Update this file when a wave completes. It is the one place that holds "what
matters most" — without it every session re-derives priority and the owner's
actual concern loses to whatever is technically loudest.

**Legend:** `S` under a day · `M` a day or two · `L` more than that.

---

## Owner-blocked — nothing in this repo unblocks these

State these every wave until resolved. They do not age out.

| # | Blocker | What it costs | What unblocks it |
|---|---|---|---|
| **B1** | Anonymous sign-ins disabled in Supabase Auth | **The entire share-link vote path is dead.** Post-020 every read needs a session; guests cannot get one. Nobody but a plan's creator can read or vote on a plan. | One dashboard toggle |
| **B2** | Migration 021 unapplied | `valid_control_secret` is a live unauthenticated oracle; `execute_plan_command` still `anon`-executable | Paste `supabase/migration-021-revoke-anon-execute.sql` |
| **B3** | OpenAI credits exhausted | No AI behaviour verifiable — smart search, RAG, tool calling | Top up (~$0.0002 for the catalog backfill) |

B1 is the most expensive thing on this page. `PRODUCT_STRATEGY.md` names
"excellent no-install share voting" as delivery item #1, and it is currently
non-functional in production.

---

## Wave 0 — reconcile the map ✅ done 2026-08-28

Every lane navigates by these docs; they described a schema that no longer
existed.

- [x] **F0.1** Stale RLS claims fixed in `.claude/agents/README.md`,
      `security.md`, `backend-data.md`, `CLAUDE.md`. There is no `using (true)`
      policy left on the core tables — 020 replaced them with `plan_access`
      scoping. `security.md`'s frontmatter was routing on the old posture too.
- [x] **F0.2** `NEXT_AGENT.md` rule 6 — 020 applied, 021 pending.
- [x] **F0.4** After Dark committed (`67d76a3`).
- [x] **F0.5** Motion section reversed for bounded ambient night motion, with a
      note matching the Colour section's voice so it is not restored by accident.
- [ ] **F0.3** Refresh graphify — built at `55f3237`, HEAD has moved.

---

## Wave 1 — FRONTEND (priority lane)

The audit found one story, and it is not "unfinished work": the app was
**deliberately walked back from playful to sleek**, and "boring" is that decision
showing. Three independent pieces of evidence — the palette comment at
`globals.css:1` (*"these used to be a lilac ground with plum ink and loud
purple/pink/yellow/green accents"*), the orphaned signature element, and ~450
lines of dead "fun" CSS. **Most of this lane is recovery, not invention.**

| # | Task | Why | Size |
|---|---|---|---|
| **FE.1** | **Ship a real front door.** `app/page.tsx:6` sends signed-out visitors to `/login` in production; `app/home-preview/page.tsx:5` calls `notFound()` there. The marketing hero — best copy and layout in the repo — is **dev-only**. Every prospect meets an auth form. | Highest impact-to-effort in the audit | S |
| **FE.2** | **Restore the signature element, resolve the restraint block.** `globals.css:113` defines `.token` under its own heading *"the thread that makes the whole app feel tappable"*. It is orphaned (dropped from `OptionCard` in `8c3581c`, with the winner `rosette` stamp) **and** killed again at `:2941`, which also cancels hover `transform` on every `a`/`button` on every pointer device. | This is the mechanism behind "flat" | M |
| **FE.3** | **Theme follows the Dubai clock.** Recover the phase engine from `3dd972b` into `lib/dubai-phase.ts`; map phase → theme; `auto \| day \| night` override on `deal-three:theme`, default `auto`. | Ships the chosen direction to share-link voters, who cannot reach it at all today | L |
| **FE.4** | **Night coverage.** Only `.home-experience--night` / `.vote-experience--night` exist. `/login` + `/onboarding` use a separate `--auth-*` set with **no night variant**; `/privacy` + `/terms` have none. Cheapest correct fix: `--auth-*` falls back to `--color-*`. | Once FE.3 lands, an after-sunset visitor hits white screens mid-flow | L |
| **FE.5** | **Extend After Dark to the payoff.** `DecidedPlan.tsx` renders inside `.vote-experience--night` so it inherits the flipped variables but none of the lattice, halo or brass structure. | The winner reveal is the most emotionally important moment in the product | M |
| **FE.6** | **Decide on ~450 lines of dead "fun" CSS (~14% of the file).** A complete time-keeping skyline (`:188-444`, 7 `[data-phase]` palettes) and a decision-orbit wheel with floating ramen/karaoke/beach cards, scribbles, ticker (`:1037-1195`, `:1899-1938`). **FE.3 revives the `[data-phase]` half for free.** | Revive the cheap charm or delete — do not leave it dead a third time | M–L |
| **FE.7** | The vote page's `loading` / `error` / `captcha` / `notfound` states are unstyled scaffolding beside the most polished screen in the app, and are a real first-touch surface for a guest on an expired link. Four hand-rolled variants → one shared state component. | | M |
| **FE.8** | `.home-avatar` is 40×40px (`:631`), below the 44px the same file enforces at `:2850`. On screen on all five tabs. | | S |
| **FE.9** | **Component reuse.** No frontend component appears in the graph's top-10 god nodes. Empty states hand-rolled 5× across `AccountViews`/`DemoAccountViews`; three different "loading" idioms. Extract only what already repeats 3+ times. | | M |

## Wave 1 — BACKEND (parallel)

| # | Task | Why | Size |
|---|---|---|---|
| **BE.1** | **Revive the share-link vote path.** Blocked on **B1** for end-to-end proof, but not for the work: make the path correct for the moment the toggle flips, and until then **fail honestly** — a guest currently meets a dead screen with no explanation. | Critical; the product's own delivery item #1 | L |
| **BE.2** | Migration 022 — `spot-deal` quota scope, and the pgvector groundwork for RAG. | `/api/spots/deal` has no quota today | M |
| **BE.3** | **Guard rail, not a task:** never add a direct write policy on `votes`/`rsvps`/`ratings`. Recorded because it is the easiest hole in the repo to reopen. | | — |

## Wave 1 — SECURITY (parallel, read-only, never blocked)

| # | Task |
|---|---|
| **SEC.1** | Re-probe and report migration 021. Probe positively — `42501` proves nothing about your input. |
| **SEC.2** | `execute_plan_command` still `anon`-executable. Fails safe by raising, so defence-in-depth, not a break. |
| **SEC.3** | `/api/smart-search` skips auth when `NODE_ENV !== "production"` and consumes quota only when a user is present. Confirm preview deploys don't inherit it; prefer an explicit flag. |
| **SEC.4** | Full re-audit against the **current** schema. Check every function for the `revoke from public` mistake, not just the two known ones. |

## Wave 2 — verifier gate (`qa-test`)

| # | Task | Why |
|---|---|---|
| **QA.1** | **The tally and tie-break have zero automated coverage.** The `order by yes_count desc, spot_id` logic in `execute_plan_command` decides who wins a plan and is tested by nothing. All 25 tests are pure-function unit tests; `scripts/smoke-test.mjs` needs live infrastructure, so it is deployment verification, not regression coverage. | Highest-value test gap in the repo |
| **QA.2** | `test:security` and `test:wrapped` are plain aliases for `npm run test` and filter nothing — the names promise coverage they do not give. | A green `test:security` is currently misleading |
