-- Migration 065: a spot other people depend on cannot be deleted. STAGED --
-- written, not applied anywhere. PRIORITIES C5, 2026-09-25.
--
-- The hole: "delete own custom spots" (020) lets a spot's owner DELETE it, and
-- plan_spots.spot_id, votes.spot_id, ratings.spot_id, visits.spot_id and
-- place_collection_items.spot_id are all `on delete cascade`. One delete by the
-- owner silently removed that option -- and every vote on it -- from other
-- people's live plans, and erased friends' visit logs and lists. It also fed
-- Realtime: a plan_spots DELETE is broadcast to every subscriber of the table
-- without RLS, carrying the primary key (plan_id, spot_id), and a plan id is a
-- join capability (claim_plan_access). See worklog 2026-09-25.
--
-- The rule (a BEFORE DELETE row trigger on spots, so it holds for every path:
-- PostgREST, definer RPCs, seeds, operator SQL). A spot is refused deletion if:
--   1. it is in ANY plan -- a plan_spots row, a vote, a rating, or a plan's
--      winner -- open OR decided, the deleter's own plans included. A decided
--      plan's options are its results screen and visits point at its winner;
--      every plan is shared by construction, so "own plan" is no exemption.
--   2. it is in SOMEONE ELSE's personal data -- a visit, a place-list item, or
--      an import resolved to it. The deleter's OWN visits and list items still
--      cascade as before: deleting your own place clears your own log of it.
-- These are the same clauses delete_my_account (060) uses to decide which
-- custom spots it may delete; its predicate is stricter (any reference at all
-- blocks it), so it never trips this trigger and behaves exactly as before.
--
-- Error: SQLSTATE 23503 (foreign_key_violation; PostgREST answers 409) with a
-- person-readable message and hint the client can show verbatim. The way out
-- is one that already exists: `visibility = 'private'` via the existing
-- "update own custom spots" policy hides the place from Discover/community,
-- while "read permitted spots" still lets plan members read it through
-- plan_spots, so nobody's plan breaks. No new column, flow or UI.
--
-- SECURITY DEFINER is required, not a convenience: the owner usually cannot
-- SELECT other people's plan_spots/votes/visits under RLS, so an invoker
-- trigger would see nothing and let the delete through. The function reads
-- only existence, returns nothing, and runs only for rows the caller's own
-- delete policy already matched -- the caller learns "your place is in use",
-- never which plan or whose. auth.uid() null (operator SQL, seeds) matches
-- nobody as "own", so it fails closed: any reference refuses.
--
-- Concurrency: the row lock DELETE takes on the spot is taken before the
-- trigger body runs, and plan_spots' FK check takes KEY SHARE on the same row,
-- so a racing create_secure_plan either waits and then fails its FK check, or
-- commits first and is then seen by the trigger's fresh READ COMMITTED snapshot.
--
-- Knock-on: re-running supabase/seed.sql or seed-categories.sql (both
-- `delete from spots ...`) on a database that has plans using those spots now
-- raises instead of silently cascading those plans' options away. That is the
-- intended outcome.
--
-- Re-run safe: create or replace + drop trigger if exists. No row shape
-- change; lib/types.ts unaffected.

create or replace function public.protect_spots_in_use()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if exists (select 1 from plan_spots x where x.spot_id = old.id)
     or exists (select 1 from votes x where x.spot_id = old.id)
     or exists (select 1 from ratings x where x.spot_id = old.id)
     or exists (select 1 from plans x where x.winner_spot_id = old.id) then
    raise exception 'This place is part of a plan, so it can''t be deleted.'
      using errcode = '23503',
            hint = 'Make it private instead: it leaves Discover, and plans that already use it keep working.';
  end if;

  if exists (select 1 from visits x where x.spot_id = old.id
               and not exists (select 1 from people p
                               where p.id = x.person_id and p.auth_user_id = uid))
     or exists (select 1 from place_collection_items x
                join place_collections c on c.id = x.collection_id
                where x.spot_id = old.id
                  and not exists (select 1 from people p
                                  where p.id = c.person_id and p.auth_user_id = uid))
     or exists (select 1 from place_imports x where x.resolved_spot_id = old.id
                  and not exists (select 1 from people p
                                  where p.id = x.person_id and p.auth_user_id = uid)) then
    raise exception 'Someone else has saved or visited this place, so it can''t be deleted.'
      using errcode = '23503',
            hint = 'Make it private instead: it leaves Discover, and their saved places keep working.';
  end if;

  return old;
end;
$$;

-- A trigger function cannot be called directly, but no client role needs
-- EXECUTE on it either (the 021/024 trap: revoke the named grants too).
revoke all on function public.protect_spots_in_use() from public, anon, authenticated;

drop trigger if exists spots_protect_in_use on spots;
create trigger spots_protect_in_use before delete on spots
  for each row execute function public.protect_spots_in_use();
