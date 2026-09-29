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
--   plan hosted and decided  15  (at most two a Dubai day)
--   photo added               3  (at most five a Dubai day)
-- A plan counts (for hosting and for its visits) only if at least two
-- accounts voted on it and its winner is a curated place: a direct plan is
-- created already decided, and anyone can join one with a second account.
-- New places earn from "I went here" (085's counter) or such plans, at most
-- five first visits a Dubai day in all. "This month" is the Dubai calendar
-- month, on server timestamps (085). Recorded, not fixed: month points can be
-- recycled (unrank and re-rank, delete and re-add a plan visit, reopen and
-- re-decide); all-time boards are unaffected.
--
-- What a board shows: a rank, first name + last initial, the profile emoji,
-- the points (or, on a place board, the ranking band), whether the row is
-- you, and an opaque key that differs per board, so rows can't be joined
-- across boards. A place board is you and your friends only: every row on it
-- means "has been here", and visits are friends-only.

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
  -- Plans the group actually decided: two or more accounts voted, and the
  -- winner is a curated place.
  group_plans as (
    select p.id, p.created_by_user_id, p.decided_at, lower(w.area) as area
    from plans p
    join spots w on w.id = p.winner_spot_id and w.source = 'curated' and w.visibility <> 'private'
    where p.status = 'decided'
      and (select count(distinct v.user_id) from votes v where v.plan_id = p.id and v.user_id is not null) >= 2
  ),
  first_visits as (
    select v.person_id, v.spot_id, c.area, min(v.created_at) as at
    from visits v join counted c on c.id = v.spot_id
    where v.plan_id is null or v.plan_id in (select g.id from group_plans g)
    group by v.person_id, v.spot_id, c.area
  ),
  -- At most five new places earn a Dubai day, however they were logged.
  earned as (
    select fv.*, row_number() over (
      partition by fv.person_id, (fv.at at time zone 'Asia/Dubai')::date order by fv.at, fv.spot_id) as nth
    from first_visits fv
  ),
  places as (
    select e.person_id, count(*) * 10 as pts from earned e
    where e.nth <= 5 and (p_since is null or e.at >= p_since) group by e.person_id
  ),
  areas as (
    select fa.person_id, count(*) * 20 as pts from (
      select e.person_id, e.area, min(e.at) as at from earned e where e.nth <= 5 group by e.person_id, e.area
    ) fa
    where p_area is null and (p_since is null or fa.at >= p_since) group by fa.person_id
  ),
  ranked as (
    select r.person_id, count(*) * 5 as pts from place_rankings r join counted c on c.id = r.spot_id
    where p_since is null or r.created_at >= p_since group by r.person_id
  ),
  hosted as (
    select h.person_id, sum(least(h.n, 2)) * 15 as pts from (
      select pe.id as person_id, (g.decided_at at time zone 'Asia/Dubai')::date as day, count(*) as n
      from group_plans g
      join people pe on pe.auth_user_id = g.created_by_user_id
      where (p_since is null or g.decided_at >= p_since)
        and (p_area is null or g.area = lower(p_area))
      group by pe.id, day
    ) h group by h.person_id
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
-- the spot id; you and your friends only) | 'friends'. p_period: 'month' | 'all'. The top p_limit rows,
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
  -- Differs per board, so one person's rows can't be joined across boards.
  salt text := p_scope || ':' || coalesce(lower(trim(p_key)), '') || ':' || p_period || ':';
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
    if p_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
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
          and (pe.id = me or exists (select 1 from friendships f where f.person_id = me and f.friend_id = pe.id))
          and (since is null or r.updated_at >= since)
      ),
      ranked as (
        select rw.*, rank() over (order by rw.score desc)::integer as rk from rows rw
      )
      select rk.rk, md5(salt || rk.person_id::text), board_label(pe.display_name), pe.emoji,
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
    select rk.rk, md5(salt || rk.person_id::text), board_label(pe.display_name), pe.emoji,
           rk.points, null::text, rk.person_id = me
    from ranked rk join people pe on pe.id = rk.person_id
    where (rk.rk is not null and rk.rk <= lim) or rk.person_id = me
    order by rk.rk nulls last, board_label(pe.display_name);
end $$;
revoke all on function leaderboard(text, text, text, integer) from public, anon, authenticated;
grant execute on function leaderboard(text, text, text, integer) to authenticated;

commit;
