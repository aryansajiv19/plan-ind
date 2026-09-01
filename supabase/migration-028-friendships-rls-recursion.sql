-- Migration 028 — fix a real 42P17 (infinite recursion detected in policy)
-- on every write to `friendships`. Apply after 027. Additive replace of two
-- policies; no table/column/constraint change; re-run safe.
--
-- Found live while checking the anon-social-graph write surface (SEC.4
-- follow-up, B1 just went live): a real anonymous session got a 500 "infinite
-- recursion detected in policy for relation \"friendships\"" on
-- `POST /rest/v1/friendships` — not a clean 403/42501 rejection. Reproduced
-- with a signed-in-shaped session too (locally): it is unconditional, not
-- anon-specific. `lib/social.ts`'s friend functions have zero UI callers
-- today (per worklog), so this has never been hit in the app, but it is live
-- and would break "add a friend" the moment that ships, for every caller.
--
-- Root cause: `people`'s read policy ("read permitted people") queries
-- `friendships` (to check "is this person my friend"), and `friendships`'
-- write policies ("add own friendships", "remove own friendships") queried
-- `people` (to check "do I own this person_id"). Postgres's RLS
-- recursion guard refuses re-entrant policy evaluation on the same relation
-- (`friendships`) once it is already mid-evaluation for the statement, even
-- though the actual predicate chain would terminate. This is a well-known
-- Postgres/RLS limitation with cross-referencing policies between two
-- tables, not specific to this app's data. Reproduced and the fix verified
-- locally on a throwaway Postgres 16 with the exact clause shapes (a plain
-- role reproduced the 42P17 on both INSERT and DELETE; both are fixed below).
--
-- Fix: the `people` lookup in both policies was unnecessary anyway.
-- `people.id` is always exactly `auth.uid()` for a permanent account
-- ("create own permanent profile"'s `with check (... and id = auth.uid() and
-- auth_user_id = auth.uid())"), and `friendships.person_id` references
-- `people.id` — so `exists (select 1 from people p where p.id = person_id and
-- p.auth_user_id = auth.uid())` is exactly equivalent to `person_id =
-- auth.uid()`, without ever touching `people`. That single simplification
-- breaks the cycle entirely: `people` still reads `friendships` (one
-- direction, fine), but `friendships` no longer reads `people` at all.
--
-- The `people` row still has to exist for a real friendship (the
-- `friendships_person_id_fkey` / `friendships_friend_id_fkey` foreign keys
-- enforce that independently of RLS), so no permissiveness is lost — an
-- anonymous session still cannot create a friendship, it now just gets there
-- via a clean rejection path instead of a recursion crash: `is_permanent_user()`
-- fails closed first (matching every sibling "own X" policy's pattern), and
-- even without that, no `people` row exists for an anonymous uid, so the FK
-- would reject the insert anyway.

drop policy if exists "add own friendships" on friendships;
create policy "add own friendships" on friendships for insert to authenticated
  with check (is_permanent_user() and person_id = (select auth.uid()));

drop policy if exists "remove own friendships" on friendships;
create policy "remove own friendships" on friendships for delete to authenticated
  using (is_permanent_user() and person_id = (select auth.uid()));

-- ── Verification (run after applying) ────────────────────────────────────
-- As any authenticated session with a people row:
--   insert into friendships (person_id, friend_id) values (auth.uid(), <someone>);
--   -- expect success, not 42P17.
--   insert into friendships (person_id, friend_id) values (<someone-else>, auth.uid());
--   -- expect a clean RLS rejection (42501-shaped `new row violates row-level
--   -- security policy`), not 42P17.
--   delete from friendships where person_id = auth.uid();
--   -- expect success, not 42P17.
