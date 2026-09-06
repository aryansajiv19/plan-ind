-- Migration 040: indexes that only start paying at catalogue scale, plus the
-- parked p_choice null-guard fix.
--
-- Measured on the local stack against a seeded catalogue (82 real spots plus
-- synthetic rows), not assumed. Numbers are medians of 15 runs of Postgres's
-- own reported Execution Time, after two discarded warm-up runs.
--
-- ── 1. Trigram index for search ──────────────────────────────────────────
--
-- Search runs `name ilike '%query%'` (StartPlanForm, action-search-bar). A
-- btree cannot serve a leading wildcard, but the existing spots_name_idx was
-- NOT simply unused: with `order by name limit 8`, Postgres walks the name
-- btree in order and stops after 8 matches, which is fast for a COMMON term.
-- The pathological case is a rare or absent term -- a typo, or a venue we do
-- not have -- where it must walk everything:
--
--   n=5082    common term   no match    rare term
--   before      0.082 ms     2.256 ms    2.302 ms     (seq scan on a miss)
--   after       0.087 ms     0.074 ms    0.109 ms     (trigram bitmap scan)
--                            30x          21x
--
-- Note the common-term case gets marginally SLOWER (~0.005 ms, inside noise):
-- the GIN bitmap costs a little more than an early-exiting btree walk. That
-- is the right trade -- misses are the case users actually generate.
--
-- ⚠ THE CROSSOVER MATTERS MORE THAN EITHER ENDPOINT. At 1082 rows the
-- planner IGNORES this index and seq-scans anyway, because scanning 1082
-- rows is genuinely cheaper than the GIN machinery -- so at today's 82
-- spots, and at the owner's near-term 1000, this index does nothing at all.
-- It starts being chosen at ~1,200 rows. It is worth adding now because the
-- target is "500-1000s" and the crossover sits just past 1000, not because
-- it helps today.
--
-- ── 2. Partial index for the deal pool ───────────────────────────────────
--
-- dealSpotIds filters `source='curated' and category in (<family>)`. Partial
-- on source, keyed on category, because every deal query carries both.
--
--   deal query, n=5082:  0.656 ms -> 0.340 ms  (1.9x)
--
-- NOT indexing `area`: it is never a SQL filter anywhere in this codebase --
-- only read in JS for coordinate lookup (lib/spots/match.ts). An index no
-- query shape can use costs write throughput and buys nothing.
--
-- ── 3. The p_choice null-guard ───────────────────────────────────────────
--
-- Parked from the end-to-end journey run, riding along as promised.
-- `p_choice not in ('coming','maybe','no')` evaluates to NULL -- not TRUE --
-- when p_choice is NULL, so the `or` never fires, a null choice reaches the
-- insert, and it dies on the column's NOT NULL as a raw 23502 instead of the
-- intended 42501. Migration 035's newer p_transport guard already uses the
-- correct `is not null and ... not in` shape; this older line never got it.
-- Not reachable from the UI (setRsvp is typed to the three literals), so
-- this is a latent trap being closed, not a live bug being fixed.

create extension if not exists pg_trgm with schema extensions;

create index if not exists spots_name_trgm_idx
  on public.spots using gin (name extensions.gin_trgm_ops);

create index if not exists spots_curated_category_idx
  on public.spots (category) where source = 'curated';

analyze public.spots;

-- Only the guard line changes; the rest is migration 035's body verbatim.
create or replace function set_plan_rsvp(
  p_plan_id uuid, p_voter_name text, p_coming boolean, p_choice text, p_participant_token_hash text,
  p_transport text default null, p_seats_available smallint default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing rsvps%rowtype;
  target plans%rowtype;
  clean_name text := left(trim(p_voter_name), 40);
begin
  -- 040: `p_choice is null or p_choice not in (...)`. The old form omitted
  -- the null test, and `NULL not in (...)` is NULL rather than TRUE, so a
  -- null choice slipped past this guard entirely.
  if p_participant_token_hash !~ '^[0-9a-f]{64}$'
     or p_choice is null or p_choice not in ('coming', 'maybe', 'no') then
    raise exception 'Participant authorization required' using errcode = '42501';
  end if;
  if clean_name = '' then
    raise exception 'Enter a name before replying' using errcode = '22023';
  end if;
  if p_transport is not null and p_transport not in ('driving', 'need_ride', 'own_way') then
    raise exception 'Unsupported transport choice' using errcode = '22023';
  end if;
  if p_seats_available is not null and (p_transport is distinct from 'driving' or p_seats_available not between 0 and 8) then
    raise exception 'Seats only apply when driving, 0 to 8' using errcode = '22023';
  end if;

  select * into target from plans where id = p_plan_id;
  if target.id is null then
    raise exception 'That plan does not exist' using errcode = '22023';
  end if;

  loop
    select * into existing from rsvps where plan_id = p_plan_id and voter_name = clean_name for update;
    if existing.id is not null and existing.participant_token_hash is not null
       and existing.participant_token_hash <> p_participant_token_hash then
      raise exception 'That participant name is already in use' using errcode = '42501';
    end if;
    if existing.id is null then
      begin
        insert into rsvps (plan_id, voter_name, coming, choice, participant_token_hash, transport, seats_available)
        values (p_plan_id, clean_name, p_coming, p_choice, p_participant_token_hash, p_transport, p_seats_available);
        return;
      exception when unique_violation then
      end;
    else
      update rsvps set coming = p_coming, choice = p_choice, participant_token_hash = p_participant_token_hash,
        transport = p_transport, seats_available = p_seats_available
        where id = existing.id;
      return;
    end if;
  end loop;
end; $$;

-- create or replace preserves the ACL, so the 035 grants still stand. Stated
-- rather than assumed, because this directory's history has a recurring bug
-- where a drop+create silently re-granted anon (see supabase/CLAUDE.md).
