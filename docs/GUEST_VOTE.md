# Guest voting (migration 099, STAGED)

Owner direction 2026-10-01: a friend taps a plan link, types a first name and
votes in about ten seconds. This reverses the sign-in wall of 064 for
**voters only**. Hosts, Luna, plan creation and everything social stay
account-only.

## Owner checks before applying 099

In the Supabase dashboard (Authentication) confirm BOTH are on: **anonymous
sign-ins**, and **CAPTCHA** with the Turnstile secret (the one email OTP uses).
Auth verifies the token; with CAPTCHA off, only the per-IP limit brakes minting.

## Model

A guest is a **Supabase anonymous session** (`is_anonymous` claim) bound to
**exactly one plan** by a `guest_sessions` row. 064's rule becomes: a
participant RPC or plan read is allowed for a permanent account **or an active
guest of that plan**.

Why anonymous sessions and not a signed guest token: every account-only gate
in the repo (policies, RPCs, 8 API routes, `is_permanent_user()`) already keys
on the anonymous claim, so a guest is born with no account powers and the new
code only has to *open* three things (plan reads, `cast_plan_vote`,
`set_plan_rsvp`). A custom token would need a second identity path through
RLS, Realtime and every RPC. The uid also survives a link-upgrade, so votes
follow for free. Cost: anonymous users are real `auth.users` rows (see risks).

Flow: `POST /api/guest/join {planId, name, captchaToken}`
1. Origin/CSRF check, then `consume_guest_limit` (per hashed IP and global).
2. No session: `signInAnonymously({captchaToken})`. Supabase Auth verifies
   Turnstile (the same dashboard CAPTCHA the OTP sign-in uses).
3. `join_plan_as_guest(secret, plan, name)` writes `guest_sessions` and
   `plan_access`. Needs `SECURITY_CONTROL_SECRET`, so a browser cannot call it.
4. A refused guest is signed out again (no plan-less session left in the cookie).

After that the guest is an ordinary `plan_access` member: reads, Realtime row
changes and presence follow the existing membership rule, unchanged.

## Rules enforced in the database

- **One plan.** `guest_sessions.user_id` is the key; a second plan answers
  `other_plan`. `claim_plan_access` still refuses anonymous sessions.
- **Cap:** 20 active guests per plan (joins serialised by a row lock).
- **Expiry:** 14 days from creation, not sliding. Expired = reads and writes
  refused (`expires_at > now()` in both predicates).
- **Age:** a guest has no age and counts as 13 (`MIN_ACCOUNT_AGE`, the rule
  `/api/spots/deal/sample` applies to an unknown age). A plan whose required
  age (`plan_required_age`: category and every dealt spot) is above 13 answers
  `age_gated` and tells the guest to sign in. Re-checked on every read/vote, so
  a plan that later gains an adults-only place locks its guests out.
- **Voter name:** the guest's stored name labels the ballot, never the request
  body. One ballot per account per round (`votes_user_round_key`) holds for
  guests: a second vote replaces the first.
- **Merge locking:** `guest_may_act` takes a share lock on the guest row;
  `merge_guest_into_me` holds it for update, so no vote lands mid-merge. Lock
  order is plan first, then guest row, as in `remove_plan_member` (no deadlock; tested).

## Upgrade

`issue_guest_merge_token()` (guest session) returns a one-time secret the
browser keeps across the sign-in redirect; only its sha256 is stored (valid
24 h, rotates on each call). After sign-in `merge_guest_into_me(token)` moves
`plan_access`, the ballots and the reply to the account. Where the account
already voted that round (or replied) **its own row wins** and the guest's is
dropped. Idempotent: same caller + token answers `already`; any other caller is
refused. Same-uid upgrade (Supabase `linkIdentity`/`updateUser`) answers
`linked` and moves nothing. A new member meets the plan's age gate.

## Threats

| Threat | Mitigation |
|---|---|
| Script mints guests / drains Luna (the pre-064 problem) | Guests are anonymous: Luna, smart-search, deal, plan create, import, photos quota are account-only at route and RPC. Turnstile at mint (Auth); 10/min and 60/day per IP (/64 for IPv6) before minting; 800/day global counted only when a guest row is really created, so garbage tokens cannot burn it; 20 per plan |
| Same person votes many times | Per-guest one ballot per round; extra ballots cost a Turnstile + IP slot each and are capped per plan. Not preventable without an account, by design |
| Guest reads/votes in another plan | Reads: `plan_access` row per plan; writes: `guest_may_act(p_plan_id)` plus the membership trigger. Tested both ways |
| Guest sees adults-only places | Age treated as 13; refused at join, re-checked at every read/vote |
| Browser calls join directly | Needs the control secret; no client grant on `guest_sessions` |
| Direct table writes | None added. `votes`/`rsvps`/`ratings` keep no write policy |
| Realtime leak | Publication unchanged; table RLS and presence policies use the same predicate; `guest_sessions` is not published |
| Stolen merge secret | 256-bit, stored hashed, 24 h, single owner (first permanent claimant), needs a permanent session |
| Host removes a guest, who returns | `removed` per uid; removal ends the pass; sign-in + merge is refused (merge checks the guest uid too); a fresh session costs a Turnstile and an IP slot |
| Link holder fills a plan with guests | The cap counts only guests still holding access; removing one frees a slot |
| Guest deletes its account to vote again, or uses place import | `delete_my_account` and `/api/place-import` refuse anonymous sessions (099) |
| Stale pre-064 anonymous users | No `guest_sessions` row, so still inert (tested) |

## Cleanup (not staged)

Anonymous `auth.users` rows pile up. pg_cron is already used here (migration
031), but a job that deletes from `auth.users` is the owner's call: daily,
delete anonymous users older than 14 days that have a `guest_sessions` row.
The cascade clears the guest row and access; ballots stay, anonymised.

## Stays account-only

Plan creation and host commands, Luna/smart-search/deal, place import, ratings
(`rate_plan`, `unrate_plan`), `leave_plan`, the When poll
(`set_time_availability`; its tables stay unreadable to guests), booking,
friends, folders, visits, uploads, profiles. A guest who wants these signs in.

## Needs the owner

- Apply 099 (owner decision, after the checks above). Update the root `CLAUDE.md` identity invariant
  and the `proxy.ts` plan-page gate in the same change.

## UI/proxy changes (frontend)

- `proxy.ts`: stop redirecting `/plan/<uuid>` for `none`/`anonymous`; keep
  `signOutAnonymous` only for `/login` and `/invite`.
- `lib/supabase/proxy.ts`: no change expected; its anonymous sign-out flag is
  already opt-in.
- `app/plan/[id]/**` and `components/` plan/vote shell: for no session or an
  anonymous one, show a name field + `Turnstile`, POST `/api/guest/join`, then
  continue; hide rating, leave, When poll, booking and Luna for guests; on
  `needsAccount` show the sign-in path.
- Sign-in from a guest: call `issueGuestMergeToken` (`lib/guest.ts`) before
  `/login`, keep the token in localStorage, call `mergeGuestVotes` after
  sign-in, then clear it.
- `components/Turnstile.tsx` reuse as is. `tests/e2e/guest-vote.spec.ts` and
  `sign-in-gate.spec.ts`/`login-redirect.spec.ts` assume the wall; qa updates.
