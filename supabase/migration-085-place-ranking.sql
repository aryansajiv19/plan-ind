-- Migration 085: Beli-style place ranking, community scores, "I went here".
--
-- STAGED -- written, not applied anywhere. Apply only with the owner's
-- approval (after the security review), then record it in worklog.md the same day.
--
-- place_rankings: one row per (person, place they have been to), in one of
-- three buckets (loved / fine / meh) at a position (1 = best in the bucket).
-- The client runs the "this or that" comparisons (lib/ranking.ts)
-- and sends the final neighbours; rank_place slots the place between them,
-- renumbers the bucket 1..n and rescores it. Score is linear by position
-- inside the bucket's band -- loved 7-10, fine 4-7, meh 0-4:
--   score = lo + (hi - lo) * (n - i) / n      (i = 0 is the best)
-- so the best place scores the band's top, bands never overlap, and one
-- place alone scores the top of its band.
--
-- Rows are private: owner-only SELECT, no write policy (every write rescores
-- the whole bucket, so writes go through these definer functions). Other
-- people only ever see the aggregate: place_scores / top_places, and only
-- once a place has at least three raters.
--
-- You can only rank a place you can see and have been to, and a ranking goes
-- when the last visit to that place does. Manual visits ("I went here") go
-- only through log_visit, five a Dubai day counted in manual_visit_counts
-- (deleting a visit doesn't give a slot back). A plan visit must be the
-- plan's winner. Leaderboard points (086) are derived from these rows, so
-- these limits are what keep them honest. Server time only: a visit's and a
-- visit photo's created_at are set by the database, and visited_at can't be
-- moved into the future or before 2000.
--
-- Security review (2026-09-29): M1 plan visits at any spot, M2 exact rater
-- counts, L1 delete-and-relog, L2 invisible spots, L3 client timestamps,
-- L4 stale scores after a cascade: all fixed here. Residual, recorded: a
-- community mean still moves when one more person ranks, so a watcher can
-- estimate that person's score; counts are shown only as bands and only at
-- 5+ raters. A daily snapshot would close it (owner's call).

begin;

create table if not exists place_rankings (
  person_id  uuid not null references people(id) on delete cascade,
  spot_id    uuid not null references spots(id) on delete cascade,
  bucket     text not null check (bucket in ('loved', 'fine', 'meh')),
  -- A sort key, renumbered 1..n inside the bucket on every write.
  position   numeric not null,
  score      numeric(3,1) not null check (score between 0 and 10),
  answers    jsonb not null default '{}'::jsonb check (pg_column_size(answers) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (person_id, spot_id)
);
create index if not exists place_rankings_order_idx on place_rankings (person_id, bucket, position);
create index if not exists place_rankings_spot_idx  on place_rankings (spot_id);
alter table place_rankings enable row level security;
revoke all on table place_rankings from public, anon, authenticated;
grant select on table place_rankings to authenticated;

drop policy if exists "read own rankings" on place_rankings;
create policy "read own rankings" on place_rankings for select to authenticated
  using ((select is_permanent_user()) and exists (
    select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid())));

-- The caller's profile id, or null (no account, a guest, or no profile yet).
create or replace function my_person_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select p.id from people p
  where p.auth_user_id = auth.uid() and (select is_permanent_user())
$$;
revoke all on function my_person_id() from public, anon, authenticated;
grant execute on function my_person_id() to authenticated;

-- The places the spots read policy lets this account see, minus retired
-- curated ones: what may be logged or ranked.
create or replace function spot_visible_to_me(p_spot uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from spots s where s.id = p_spot and (
      (s.source = 'curated' and s.visibility <> 'private')
      or s.visibility = 'community'
      or s.created_by_user_id = auth.uid()
      or exists (select 1 from plan_spots ps join plan_access a on a.plan_id = ps.plan_id
                 where ps.spot_id = s.id and a.user_id = auth.uid())))
$$;
revoke all on function spot_visible_to_me(uuid) from public, anon, authenticated;

-- The three chips after a ranking. Refused, never rewritten: an object whose
-- keys are only these, each with its small set of values.
create or replace function valid_ranking_answers(p jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k not in ('vibe', 'value', 'again'))
    and (not p ? 'vibe'  or (jsonb_typeof(p->'vibe') = 'string' and (p->>'vibe') ~ '^[a-z][a-z-]{0,23}$'))
    and (not p ? 'value' or (p->>'value') in ('great', 'fair', 'pricey'))
    and (not p ? 'again' or jsonb_typeof(p->'again') = 'boolean')
$$;
revoke all on function valid_ranking_answers(jsonb) from public, anon, authenticated;

-- Renumber one bucket 1..n (keeping its order) and rescore it.
create or replace function rescore_ranking_bucket(p_person uuid, p_bucket text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  lo numeric := case p_bucket when 'loved' then 7 when 'fine' then 4 else 0 end;
  hi numeric := case p_bucket when 'loved' then 10 when 'fine' then 7 else 4 end;
begin
  with ordered as (
    select spot_id, row_number() over (order by position, spot_id) as rn, count(*) over () as n
    from place_rankings where person_id = p_person and bucket = p_bucket
  )
  update place_rankings r
  set position = o.rn,
      score = round(lo + (hi - lo) * (o.n - (o.rn - 1)) / o.n, 1)
  from ordered o
  where r.person_id = p_person and r.spot_id = o.spot_id
    and (r.position is distinct from o.rn or r.score is distinct from round(lo + (hi - lo) * (o.n - (o.rn - 1)) / o.n, 1));
end $$;
revoke all on function rescore_ranking_bucket(uuid, text) from public, anon, authenticated;

-- Rank (or re-rank) a place: in p_bucket, just below p_after_spot (the place
-- judged better) and just above p_before_spot (judged worse). Either may be
-- null: no p_after_spot = the top of the bucket, no p_before_spot = the
-- bottom. A neighbour that isn't in that bucket of your own list is refused.
create or replace function rank_place(
  p_spot uuid,
  p_bucket text,
  p_after_spot uuid default null,
  p_before_spot uuid default null,
  p_answers jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  old_bucket text;
  above numeric;
  below numeric;
begin
  if me is null then
    raise exception 'Sign in to rank places' using errcode = '42501';
  end if;
  if p_bucket is null or p_bucket not in ('loved', 'fine', 'meh') then
    raise exception 'Pick loved, fine or meh' using errcode = '22023';
  end if;
  if p_answers is not null and not valid_ranking_answers(p_answers) then
    raise exception 'Those answers are not ones this asks' using errcode = '22023';
  end if;
  if p_spot is null or p_spot = p_after_spot or p_spot = p_before_spot then
    return jsonb_build_object('result', 'bad_neighbours');
  end if;
  if not spot_visible_to_me(p_spot)
     or not exists (select 1 from visits v where v.person_id = me and v.spot_id = p_spot) then
    return jsonb_build_object('result', 'not_visited');
  end if;

  -- One writer per person at a time: every write renumbers that person's bucket.
  perform pg_advisory_xact_lock(hashtextextended('place_rankings:' || me::text, 0));

  select bucket into old_bucket from place_rankings where person_id = me and spot_id = p_spot;

  if p_after_spot is not null then
    select position into above from place_rankings
    where person_id = me and spot_id = p_after_spot and bucket = p_bucket;
    if above is null then return jsonb_build_object('result', 'bad_neighbours'); end if;
  end if;
  if p_before_spot is not null then
    select position into below from place_rankings
    where person_id = me and spot_id = p_before_spot and bucket = p_bucket;
    if below is null then return jsonb_build_object('result', 'bad_neighbours'); end if;
  end if;

  -- A fractional slot between the neighbours; the rescore renumbers 1..n.
  -- Neither given: the top of the bucket.
  insert into place_rankings as r (person_id, spot_id, bucket, position, score, answers)
  values (me, p_spot, p_bucket,
    case
      when above is not null and below is not null then (above + below) / 2
      when above is not null then above + 0.5
      when below is not null then below - 0.5
      else coalesce((select min(position) from place_rankings
                     where person_id = me and bucket = p_bucket and spot_id <> p_spot), 1) - 0.5
    end,
    0, coalesce(p_answers, '{}'::jsonb))
  on conflict (person_id, spot_id) do update
    set bucket = excluded.bucket,
        position = excluded.position,
        answers = case when p_answers is null then r.answers else excluded.answers end,
        updated_at = now();

  perform rescore_ranking_bucket(me, p_bucket);
  if old_bucket is not null and old_bucket <> p_bucket then
    perform rescore_ranking_bucket(me, old_bucket);
  end if;

  return jsonb_build_object('result', 'ranked', 'score',
    (select score from place_rankings where person_id = me and spot_id = p_spot));
end $$;
revoke all on function rank_place(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function rank_place(uuid, text, uuid, uuid, jsonb) to authenticated;

create or replace function unrank_place(p_spot uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  gone text;
begin
  if me is null then
    raise exception 'Sign in to rank places' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('place_rankings:' || me::text, 0));
  -- place_rankings_after_delete rescores what's left.
  delete from place_rankings where person_id = me and spot_id = p_spot returning bucket into gone;
  if gone is null then
    return jsonb_build_object('result', 'not_ranked');
  end if;
  return jsonb_build_object('result', 'unranked');
end $$;
revoke all on function unrank_place(uuid) from public, anon, authenticated;
grant execute on function unrank_place(uuid) to authenticated;

-- Your list, best first: loved, then fine, then meh, each by position.
create or replace function my_ranking()
returns table (
  spot_id uuid, bucket text, "position" numeric, score numeric, answers jsonb, updated_at timestamptz,
  name text, area text, category text, photo_url text, photo_attribution text, google_place_id text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.spot_id, r.bucket, r.position, r.score, r.answers, r.updated_at,
         s.name, s.area, s.category, s.photo_url, s.photo_attribution, s.google_place_id
  from place_rankings r
  join spots s on s.id = r.spot_id
  where r.person_id = my_person_id()
  order by case r.bucket when 'loved' then 0 when 'fine' then 1 else 2 end, r.position
$$;
revoke all on function my_ranking() from public, anon, authenticated;
grant execute on function my_ranking() to authenticated;

-- How many people ranked a place, as a band: an exact count would let a
-- watcher back one person's score out of the mean.
create or replace function raters_band(n bigint)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when n >= 50 then '50+' when n >= 20 then '20+' when n >= 10 then '10+' else '5+' end
$$;
revoke all on function raters_band(bigint) from public, anon, authenticated;

-- Community scores: the mean of members' scores, only for places at least
-- five people have ranked, with the count as a band. Never who.
create or replace function place_scores(p_spot_ids uuid[])
returns table (spot_id uuid, score numeric, raters text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.spot_id, round(avg(r.score), 1), raters_band(count(*))
  from place_rankings r
  where r.spot_id = any (p_spot_ids[1:200]) and (select is_permanent_user())
  group by r.spot_id
  having count(*) >= 5
$$;
revoke all on function place_scores(uuid[]) from public, anon, authenticated;
grant execute on function place_scores(uuid[]) to authenticated;

-- Discover's "Top places": the best community scores (5+ raters) among
-- visible curated places, Dubai-wide or in one area.
create or replace function top_places(p_area text default null, p_limit integer default 20)
returns table (
  spot_id uuid, name text, area text, category text, photo_url text, photo_attribution text,
  google_place_id text, score numeric, raters text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.name, s.area, s.category, s.photo_url, s.photo_attribution, s.google_place_id,
         round(avg(r.score), 1) as score, raters_band(count(*)) as raters
  from place_rankings r
  join spots s on s.id = r.spot_id
  where (select is_permanent_user())
    and s.source = 'curated' and s.visibility <> 'private'
    and (p_area is null or lower(s.area) = lower(p_area))
  group by s.id
  having count(*) >= 5
  order by avg(r.score) desc, count(*) desc, s.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;
revoke all on function top_places(text, integer) from public, anon, authenticated;
grant execute on function top_places(text, integer) to authenticated;

-- Manual visits per person per Dubai day. A counter, not a count of rows:
-- deleting a visit must not hand the slot back.
create table if not exists manual_visit_counts (
  person_id uuid not null references people(id) on delete cascade,
  day       date not null,
  n         integer not null default 0,
  primary key (person_id, day)
);
alter table manual_visit_counts enable row level security;
revoke all on table manual_visit_counts from public, anon, authenticated;

-- "I went here": a visit with no plan, on a place you can see, not in the
-- future, at most five a Dubai day. The only way a plan-less visit is written.
create or replace function log_visit(p_spot uuid, p_visited_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  v_at timestamptz := coalesce(p_visited_at, now());
  today date := (now() at time zone 'Asia/Dubai')::date;
  used integer;
  new_id uuid;
begin
  if me is null then
    raise exception 'Sign in to log a visit' using errcode = '42501';
  end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '5 years' then
    return jsonb_build_object('result', 'bad_date');
  end if;
  if not spot_visible_to_me(p_spot) then
    return jsonb_build_object('result', 'not_found');
  end if;

  insert into manual_visit_counts as c (person_id, day, n) values (me, today, 1)
  on conflict (person_id, day) do update set n = c.n + 1
  returning n into used;
  if used > 5 then
    raise exception using errcode = 'P0001', message = 'manual visit limit';
  end if;

  insert into visits (person_id, spot_id, plan_id, visited_at)
  values (me, p_spot, null, v_at)
  returning id into new_id;
  return jsonb_build_object('result', 'logged', 'visit_id', new_id);
exception when sqlstate 'P0001' then
  -- The counter's increment rolls back with the block: the limit stays at five.
  return jsonb_build_object('result', 'limited');
end $$;
revoke all on function log_visit(uuid, timestamptz) from public, anon, authenticated;
grant execute on function log_visit(uuid, timestamptz) to authenticated;

-- A plan visit is the plan's winner, once the outing is past, by a member.
create or replace function visit_plan_spot_allowed(p_plan_id uuid, p_spot_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from plans p
    join plan_access a on a.plan_id = p.id and a.user_id = auth.uid()
    where p.id = p_plan_id and p.status = 'decided' and p.winner_spot_id = p_spot_id
      and coalesce(p.event_time, p.decided_at + interval '3 hours') <= now())
$$;
revoke all on function visit_plan_spot_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function visit_plan_spot_allowed(uuid, uuid) to authenticated;

-- Plan-less visits only through log_visit (its cap keeps 086's points honest).
drop policy if exists "log own visits" on visits;
create policy "log own visits" on visits for insert to authenticated
  with check (
    plan_id is not null
    and exists (select 1 from people p where p.id = person_id and p.auth_user_id = (select auth.uid()))
    and visit_plan_spot_allowed(plan_id, spot_id)
  );

-- Server time only, and a visit date that stays plausible after it's edited.
create or replace function visits_server_time() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  if new.visited_at > now() + interval '1 day' or new.visited_at < timestamptz '2000-01-01' then
    raise exception 'That date is not one a visit can have' using errcode = '22008';
  end if;
  return new;
end $$;
drop trigger if exists visits_server_time on visits;
create trigger visits_server_time before insert or update of visited_at on visits
  for each row execute function visits_server_time();

create or replace function visit_photos_server_time() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.created_at := now();
  return new;
end $$;
drop trigger if exists visit_photos_server_time on visit_photos;
create trigger visit_photos_server_time before insert on visit_photos
  for each row execute function visit_photos_server_time();

-- A ranking goes with the last visit to that place.
create or replace function unrank_unvisited() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from visits v where v.person_id = old.person_id and v.spot_id = old.spot_id) then
    delete from place_rankings where person_id = old.person_id and spot_id = old.spot_id;
  end if;
  return null;
end $$;
revoke all on function unrank_unvisited() from public, anon, authenticated;
drop trigger if exists visits_unrank_unvisited on visits;
create trigger visits_unrank_unvisited after delete on visits
  for each row execute function unrank_unvisited();

-- Whatever removes a ranking (unrank, a deleted visit or spot, a deleted
-- account's cascade), what's left of that bucket is renumbered and rescored.
create or replace function rescore_after_unrank() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform rescore_ranking_bucket(old.person_id, old.bucket);
  return null;
end $$;
revoke all on function rescore_after_unrank() from public, anon, authenticated;
drop trigger if exists place_rankings_after_delete on place_rankings;
create trigger place_rankings_after_delete after delete on place_rankings
  for each row execute function rescore_after_unrank();

commit;
