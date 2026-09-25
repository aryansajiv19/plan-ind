# plan-ind — Dubai plans, without the group chat

**Live:** https://plan-ind.vercel.app · **Try it without an account:** https://plan-ind.vercel.app/demo

A group decision app for going out in Dubai. One person starts a plan and sets
the budget, distance and vibe; the app deals **nine** curated places across
**three rounds of three**. Friends open a share link — no install; they sign in
with Google or an email code in seconds — and vote. Each round sends one finalist forward, a final round picks the
winner, and the plan carries through to RSVPs, who's driving, calendar export
and ratings afterwards.

The idea: group planning apps get strong *after* someone already knows what
the plan is. This one owns the ambiguous moment before that — turning "we
should do something" into a place everyone has actually agreed to.

## What's in it

- **Dealing** — constraint-aware selection from a curated Dubai catalogue
  (category, budget, straight-line distance, age suitability, places you've
  already been), plus natural-language search ("somewhere outdoors after 7,
  under AED 250").
- **Voting** — three rounds → finalists → winner, live vote counts and presence
  over Supabase Realtime, deterministic tie-breaks, host controls (edit, advance,
  decide, reopen, delete).
- **After the decision** — RSVPs, carpool ("who's driving / needs a ride"),
  booking owner, `.ics` and Google Calendar export, directions, ratings.
- **Accounts** — email one-time code or Google, required for everyone who
  joins or votes on a plan. Friends, visit history, collections,
  delete-my-account.

## Engineering

| Area | How |
|---|---|
| Stack | Next.js 16 (App Router, React 19), Tailwind v4, Supabase (Postgres, Auth, Realtime, Storage), Vercel |
| Authorization | Row-level security scoped by plan membership (`plan_access`); every vote, RSVP and rating write goes through a security-definer RPC — no direct write policies |
| Abuse controls | Postgres-backed per-user and global quotas, Cloudflare Turnstile, CSRF double-submit + Origin checks, nonce-based CSP with `strict-dynamic` |
| Correctness | Idempotent vote upserts on a unique round key, row locks around advance/decide, server-side tally as the single source of truth |
| AI | OpenAI Responses API with strict structured output, re-validated server-side; model output never reaches a query filter unchecked |
| Link import | Paste an Instagram/TikTok/web link → allow-listed adapters, private-IP and redirect guards, size and time limits |
| Testing | Hermetic unit tests (`npm test`), database tests against a local Supabase stack (`npm run test:db`), Playwright E2E, load and Realtime fan-out harnesses in `scripts/load/` |
| CI | Lint, typecheck, schema/type drift check, `npm audit`, build, DB tests, E2E |

## Run it locally

```bash
npm ci
cp .env.local.example .env.local   # fill in a Supabase project's URL + publishable key
npm run dev
```

For a throwaway local database: `supabase start`, then apply
`supabase/schema.sql` (it drops and recreates every table — never run it
against a real project). Checks: `npm run lint && npm run typecheck && npm test && npm run build`.

## Repo map

| Path | What |
|---|---|
| `app/` | Routes and API handlers |
| `components/` | UI |
| `lib/` | Domain logic: dealing, social, security, AI, place import |
| `supabase/` | `schema.sql` (scratch end-state) and numbered live migrations |
| `tests/`, `scripts/` | Tests, load harnesses, backfills |
| `docs/` | Deployment, design standards, product flow; `docs/archive/` is history |
