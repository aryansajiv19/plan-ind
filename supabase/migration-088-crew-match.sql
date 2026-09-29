-- Migration 088: crew match and crew streak, between you and one friend.
--
-- STAGED -- written, not applied anywhere. Needs 085. Apply only after the
-- security review, then record it in worklog.md the same day.
--
-- crew_match(p_friend): how aligned two friends are, 0-100, from rows both
-- of them touched, in three parts:
--   plans       rounds of shared plans where both voted: did we pick the same place?
--   rankings    places both ranked (085): how often in the same bucket?
--   categories  kinds of place each has been to: how much do they overlap?
-- A part counts only past its own minimum (2 rounds, 5 places, 3 kinds
-- between us), and the whole match only at 3 or more shared signals from
-- plans and kinds; below that it is "not_enough" with that count, never a
-- thin percentage. biggest split: the group of kinds (food, night, water,
-- active, leisure) where our plan votes agree least, from a group with 3 or
-- more shared rounds and only when agreement there is under 60%.
--
-- crew_streak(p_friend): consecutive Dubai calendar months, ending this month
-- or last, in which both of us have a visit from the same decided plan.
--
-- Privacy: only for a friend (friendships, made only by redeeming an
-- invite), else 42501. Only aggregates come back. Rankings are owner-only,
-- so their part is coarse and slow: bucket agreement (same loved/fine/meh),
-- only at 5+ places both ranked, from a snapshot taken once a Dubai day per
-- pair (crew_rank_snapshots), and only over curated, visible places. The
-- security review (2026-09-29) showed a friend could otherwise re-rank a
-- probe place between calls and read back another person's score. What is
-- left (a friend re-ranking one place a day can learn your bucket for it in
-- about two days) adds nothing: 086's friends-only place board already shows
-- a friend's bucket for every curated place, and custom places are left out
-- here. The count of places both ranked is never returned, and biggest split
-- uses plan votes only, which fellow members can already read. Visits are
-- already readable by friends.

begin;

-- The composer's five groups of kinds (components/categoryGroups.ts).
create or replace function category_group(p_category text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_category in ('dinner', 'cafe', 'brunch', 'dessert', 'shisha') then 'food'
    when p_category in ('vibes', 'nightlife', 'live_music', 'karaoke') then 'night'
    when p_category in ('beach', 'beach_club', 'water') then 'water'
    when p_category in ('sports', 'padel', 'adventure', 'outdoors', 'games') then 'active'
    when p_category in ('movie', 'culture', 'wellness', 'shopping', 'family', 'escape') then 'leisure'
  end
$$;
revoke all on function category_group(text) from public, anon, authenticated;

-- The friend's account, or a refusal: only someone in my friendships.
create or replace function crew_friend_account(p_friend uuid)
returns uuid language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  account uuid;
begin
  if me is null then
    raise exception 'Sign in to see this' using errcode = '42501';
  end if;
  select pe.auth_user_id into account
  from friendships f join people pe on pe.id = f.friend_id
  where f.person_id = me and f.friend_id = p_friend and f.friend_id <> me;
  if account is null then
    raise exception 'Only for your friends' using errcode = '42501';
  end if;
  return account;
end $$;
revoke all on function crew_friend_account(uuid) from public, anon, authenticated;

-- The rankings part, once a Dubai day per pair (either order).
create table if not exists crew_rank_snapshots (
  person_a  uuid not null references people(id) on delete cascade,
  person_b  uuid not null references people(id) on delete cascade,
  day       date not null,
  places    integer not null,
  agreement numeric,
  primary key (person_a, person_b),
  check (person_a < person_b)
);
alter table crew_rank_snapshots enable row level security;
revoke all on table crew_rank_snapshots from public, anon, authenticated;

create or replace function crew_match(p_friend uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  them uuid := crew_friend_account(p_friend);
  my_account uuid := auth.uid();
  rounds integer; rounds_agreed integer;
  ranked integer; ranked_agreement numeric;
  today date := (now() at time zone 'Asia/Dubai')::date;
  snap crew_rank_snapshots%rowtype;
  kinds_union integer; kinds_shared integer;
  signals integer;
  plans_part numeric; rankings_part numeric; categories_part numeric;
  total numeric; weight numeric;
  split text;
begin
  -- (a) Rounds of shared plans where both voted: the same place, or not.
  with mine as (
    select v.plan_id, v.phase, v.pool_number, array_agg(v.spot_id) as spots, max(p.category) as category
    from votes v join plans p on p.id = v.plan_id
    where v.user_id = my_account and v.value
      and exists (select 1 from plan_access a where a.plan_id = v.plan_id and a.user_id = them)
    group by v.plan_id, v.phase, v.pool_number
  ),
  theirs as (
    select v.plan_id, v.phase, v.pool_number, array_agg(v.spot_id) as spots
    from votes v
    where v.user_id = them and v.value
      and exists (select 1 from plan_access a where a.plan_id = v.plan_id and a.user_id = my_account)
    group by v.plan_id, v.phase, v.pool_number
  ),
  both_rounds as (
    select m.category, (m.spots && t.spots) as agreed
    from mine m join theirs t using (plan_id, phase, pool_number)
  ),
  -- The group where our votes agree least, from groups with 3+ shared rounds.
  by_group as (
    select category_group(category) as grp, count(*) as n,
           avg(case when agreed then 1.0 else 0.0 end) as agreement
    from both_rounds
    where category_group(category) is not null
    group by category_group(category)
  )
  select
    (select count(*) from both_rounds),
    (select count(*) filter (where agreed) from both_rounds),
    (select g.grp from by_group g where g.n >= 3 and g.agreement < 0.6 order by g.agreement, g.grp limit 1)
  into rounds, rounds_agreed, split;

  -- (b) Places both ranked, same bucket or not: today's snapshot, or take it now.
  select * into snap from crew_rank_snapshots
  where person_a = least(me, p_friend) and person_b = greatest(me, p_friend);
  if snap.day is distinct from today then
    select count(*), avg(case when a.bucket = b.bucket then 1.0 else 0.0 end)
    into ranked, ranked_agreement
    from place_rankings a
    join place_rankings b on b.spot_id = a.spot_id and b.person_id = p_friend
    -- The same scope as 086's place board, so nothing here is new to a friend.
    join spots s on s.id = a.spot_id and s.source = 'curated' and s.visibility <> 'private'
    where a.person_id = me;
    insert into crew_rank_snapshots (person_a, person_b, day, places, agreement)
    values (least(me, p_friend), greatest(me, p_friend), today, ranked, ranked_agreement)
    on conflict (person_a, person_b) do update
      set day = excluded.day, places = excluded.places, agreement = excluded.agreement;
  else
    ranked := snap.places;
    ranked_agreement := snap.agreement;
  end if;

  -- (c) Kinds of place each has been to.
  with my_kinds as (
    select distinct s.category from visits v join spots s on s.id = v.spot_id where v.person_id = me
  ),
  their_kinds as (
    select distinct s.category from visits v join spots s on s.id = v.spot_id where v.person_id = p_friend
  )
  select
    (select count(*) from (select category from my_kinds union select category from their_kinds) u),
    (select count(*) from my_kinds m join their_kinds t using (category))
  into kinds_union, kinds_shared;

  -- Never counts places both ranked: that number would say what the friend ranked.
  signals := rounds + kinds_shared;
  plans_part := case when rounds >= 2 then rounds_agreed::numeric / rounds end;
  rankings_part := case when ranked >= 5 then ranked_agreement end;
  categories_part := case when kinds_union >= 3 then kinds_shared::numeric / kinds_union end;

  weight := coalesce(case when plans_part is not null then 0.4 end, 0)
          + coalesce(case when rankings_part is not null then 0.4 end, 0)
          + coalesce(case when categories_part is not null then 0.2 end, 0);
  if signals < 3 or weight = 0 then
    return jsonb_build_object('status', 'not_enough', 'signals', signals, 'needed', 3);
  end if;
  total := (coalesce(plans_part * 0.4, 0) + coalesce(rankings_part * 0.4, 0) + coalesce(categories_part * 0.2, 0)) / weight;

  return jsonb_build_object(
    'status', 'ready',
    'score', round(total * 100)::integer,
    'parts', jsonb_build_object(
      'plans', case when plans_part is null then null
        else jsonb_build_object('agreement', round(plans_part * 100)::integer, 'rounds', rounds) end,
      'rankings', case when rankings_part is null then null
        else jsonb_build_object('agreement', round(rankings_part * 100)::integer) end,
      'categories', case when categories_part is null then null
        else jsonb_build_object('overlap', round(categories_part * 100)::integer, 'shared', kinds_shared) end
    ),
    'biggest_split', split,
    'signals', signals
  );
end $$;
revoke all on function crew_match(uuid) from public, anon, authenticated;
grant execute on function crew_match(uuid) to authenticated;

create or replace function crew_streak(p_friend uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  them uuid := crew_friend_account(p_friend);
  this_month date := date_trunc('month', now() at time zone 'Asia/Dubai')::date;
  last_month date := (date_trunc('month', now() at time zone 'Asia/Dubai') - interval '1 month')::date;
  months date[];
  cursor_month date;
  streak integer := 0;
begin
  -- Months (Dubai) of decided plans both of us have a visit from.
  select array_agg(distinct m order by m desc) into months
  from (
    -- Capped at this month: an outing time edited into the future can't count ahead.
    select least(date_trunc('month', coalesce(p.event_time, p.decided_at) at time zone 'Asia/Dubai')::date, this_month) as m
    from visits a
    join visits b on b.plan_id = a.plan_id and b.person_id = p_friend
    join plans p on p.id = a.plan_id and p.status = 'decided'
    where a.person_id = me and a.plan_id is not null
  ) x;

  if months is null or months[1] < last_month then
    return jsonb_build_object('months', 0, 'since', null, 'this_month_open', true);
  end if;
  -- Count back from the latest month while the months run on unbroken.
  cursor_month := months[1];
  for i in 1 .. array_length(months, 1) loop
    exit when months[i] <> cursor_month;
    streak := streak + 1;
    cursor_month := (cursor_month - interval '1 month')::date;
  end loop;

  return jsonb_build_object(
    'months', streak,
    'since', to_char((cursor_month + interval '1 month')::date, 'YYYY-MM'),
    -- This month hasn't counted yet: one plan together keeps the streak going.
    'this_month_open', months[1] < this_month
  );
end $$;
revoke all on function crew_streak(uuid) from public, anon, authenticated;
grant execute on function crew_streak(uuid) to authenticated;

commit;
