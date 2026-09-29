-- Migration 086: leaderboards (Dubai, area, place, friends).
--
-- STAGED -- written, not applied anywhere. Needs 085. Apply only with the
-- owner's approval (after the security review), then record it in
-- worklog.md the same day.
--
-- Public to every signed-in account (the owner's decision); a person can hide
-- from the public boards with people.hide_from_boards (their friends board
-- still shows them to their friends, and they always see their own rank).
--
-- Points are derived from rows that already exist, never stored, so nothing
-- can double-count or drift. Only curated catalogue places count (custom
-- places are unbounded, so they would farm points):
--   new place visited        10  (the first visit to each place)
--   new area                 20  (the first visit to each area; Dubai boards only)
--   place ranked              5  (085: only places you have been to)
--   plan hosted and decided  15  (only plans with at least two members)
--   photo added               3  (at most five counted a Dubai day)
-- "This month" is the Dubai calendar month, on server timestamps (085 sets
-- visits' and photos' created_at). A visit earns only if it is "I went here"
-- (five a day, 085) or from a plan with at least two members.
--
-- What a board shows: a rank, first name + last initial, the profile emoji,
-- the points (or, on a place board, the ranking band), whether the row is
-- you, and a stable opaque key (not an id). The place board ranks by ranking
-- score only, a deliberate act; it never shows who has been where.

begin;

alter table people add column if not exists hide_from_boards boolean not null default false;

-- "Sara Ahmed" -> "Sara A.", "Sara" -> "Sara"; never more than a first name
-- and an initial.
create or replace function board_label(p_name text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case
    when parts is null or array_length(parts, 1) is null then 'Member'
    when array_length(parts, 1) = 1 then left(parts[1], 20)
    else left(parts[1], 20) || ' ' || upper(left(parts[array_length(parts, 1)], 1)) || '.'
  end
  from (select regexp_split_to_array(nullif(trim(coalesce(p_name, '')), ''), '\s+') as parts) x
$$;
revoke all on function board_label(text) from public, anon, authenticated;

-- Everyone's points since p_since (null = all time), optionally only for
-- activity at places in one area. Internal: callable only by leaderboard.
create or replace function board_points(p_since timestamptz, p_area text)
returns table (person_id uuid, points integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with counted as (
    select s.id, lower(s.area) as area from spots s
    where s.source = 'curated' and s.visibility <> 'private'
      and (p_area is null or lower(s.area) = lower(p_area))
  ),
  -- Visits that earn: "I went here" (capped by log_visit) or a plan with
  -- company. A solo plan's winner visit doesn't, since pins choose the winner.
  first_visits as (
    select v.person_id, v.spot_id, c.area, min(v.created_at) as at
    from visits v join counted c on c.id = v.spot_id
    where v.plan_id is null
       or (select count(*) from plan_access a where a.plan_id = v.plan_id) >= 2
    group by v.person_id, v.spot_id, c.area
  ),
  places as (
    select fv.person_id, count(*) * 10 as pts from first_visits fv
    where p_since is null or fv.at >= p_since group by fv.person_id
  ),
  areas as (
    select fa.person_id, count(*) * 20 as pts from (
      select fv.person_id, fv.area, min(fv.at) as at from first_visits fv group by fv.person_id, fv.area
    ) fa
    where p_area is null and (p_since is null or fa.at >= p_since) group by fa.person_id
  ),
  ranked as (
    select r.person_id, count(*) * 5 as pts from place_rankings r join counted c on c.id = r.spot_id
    where p_since is null or r.created_at >= p_since group by r.person_id
  ),
  hosted as (
    select pe.id as person_id, count(*) * 15 as pts
    from plans p
    join people pe on pe.auth_user_id = p.created_by_user_id
    left join spots w on w.id = p.winner_spot_id
    where p.status = 'decided'
      and (p_since is null or p.decided_at >= p_since)
      and (p_area is null or lower(w.area) = lower(p_area))
      and (select count(*) from plan_access a where a.plan_id = p.id) >= 2
    group by pe.id
  ),
  photos as (
    select d.person_id, sum(least(d.n, 5)) * 3 as pts from (
      select ph.person_id, (ph.created_at at time zone 'Asia/Dubai')::date as day, count(*) as n
      from visit_photos ph
      join visits v on v.id = ph.visit_id and v.person_id = ph.person_id
      join counted c on c.id = v.spot_id
      where p_since is null or ph.created_at >= p_since
      group by ph.person_id, day
    ) d group by d.person_id
  )
  select u.person_id, sum(u.pts)::integer
  from (
    select * from places union all select * from areas union all select * from ranked
    union all select * from hosted union all select * from photos
  ) u
  group by u.person_id
$$;
revoke all on function board_points(timestamptz, text) from public, anon, authenticated;

-- One board. p_scope: 'dubai' | 'area' (p_key = the area) | 'place' (p_key =
-- the spot id) | 'friends'. p_period: 'month' | 'all'. The top p_limit rows,
-- plus your own row wherever you stand (rank null when you have no points yet).
create or replace function leaderboard(
  p_scope text,
  p_key text default null,
  p_period text default 'all',
  p_limit integer default 20
) returns table (rank integer, player_key text, label text, emoji text, points integer, band text, is_me boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := my_person_id();
  since timestamptz;
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  spot uuid;
begin
  if me is null then
    raise exception 'Sign in to see the leaderboards' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('dubai', 'area', 'place', 'friends') then
    raise exception 'Unknown board' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('month', 'all') then
    raise exception 'Unknown period' using errcode = '22023';
  end if;
  if p_scope in ('area', 'place') and nullif(trim(coalesce(p_key, '')), '') is null then
    raise exception 'This board needs a place or an area' using errcode = '22023';
  end if;
  since := case when p_period = 'month'
    then date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai' end;

  if p_scope = 'place' then
    if p_key !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Unknown place' using errcode = '22023';
    end if;
    spot := p_key::uuid;
    return query
      with rows as (
        select r.person_id, r.score, r.bucket
        from place_rankings r
        join people pe on pe.id = r.person_id
        join spots s on s.id = r.spot_id and s.source = 'curated' and s.visibility <> 'private'
        where r.spot_id = spot
          and (not pe.hide_from_boards or pe.id = me)
          and (since is null or r.updated_at >= since)
      ),
      ranked as (
        select rw.*, rank() over (order by rw.score desc)::integer as rk from rows rw
      )
      select rk.rk, md5('board:' || rk.person_id::text), board_label(pe.display_name), pe.emoji,
             null::integer, rk.bucket, rk.person_id = me
      from ranked rk join people pe on pe.id = rk.person_id
      where rk.rk <= lim or rk.person_id = me
      order by rk.rk, board_label(pe.display_name);
    return;
  end if;

  return query
    with pts as (
      select bp.person_id, bp.points from board_points(since, case when p_scope = 'area' then trim(p_key) end) bp
    ),
    eligible as (
      select pe.id as person_id, coalesce(pts.points, 0) as points
      from people pe
      left join pts on pts.person_id = pe.id
      where case p_scope
        when 'friends' then pe.id = me or exists (
          select 1 from friendships f where f.person_id = me and f.friend_id = pe.id)
        else pe.id = me or (not pe.hide_from_boards and coalesce(pts.points, 0) > 0)
      end
    ),
    ranked as (
      select e.*, case when e.points > 0 then (rank() over (order by e.points desc))::integer end as rk
      from eligible e
    )
    select rk.rk, md5('board:' || rk.person_id::text), board_label(pe.display_name), pe.emoji,
           rk.points, null::text, rk.person_id = me
    from ranked rk join people pe on pe.id = rk.person_id
    where (rk.rk is not null and rk.rk <= lim) or rk.person_id = me
    order by rk.rk nulls last, board_label(pe.display_name);
end $$;
revoke all on function leaderboard(text, text, text, integer) from public, anon, authenticated;
grant execute on function leaderboard(text, text, text, integer) to authenticated;

commit;
