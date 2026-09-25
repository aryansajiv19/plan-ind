-- Migration 062: plan share preview for link crawlers. Apply after 061.
-- STAGED -- written, not applied anywhere. Re-run safe (create or replace,
-- then an explicit revoke/grant pair).
--
-- WHY. A plan link travels through WhatsApp. WhatsApp's link crawler (and
-- iMessage's, Slack's, ...) fetches the page with no cookies, so it has no
-- Supabase session, and every read of `plans` is scoped through plan_access
-- `to authenticated`. The per-plan preview (app/plan/[id]/layout.tsx and
-- app/plan/[id]/opengraph-image.tsx) therefore cannot read the row, and the
-- link unfurls as the generic site card. This function gives a keyless caller
-- a deliberately tiny, non-sensitive projection of one plan.
--
-- WHY IT IS SAFE TO GRANT TO anon: THE LINK ID IS THE CAPABILITY. plans.id is
-- gen_random_uuid(), a v4 uuid with 122 random bits -- not enumerable and not
-- guessable. Whoever holds the id already holds the whole plan: any session,
-- including a free anonymous sign-in, can redeem it with claim_plan_access
-- (see 020/021) and then read the full row, its spots, votes and names. This
-- function hands a sessionless holder of the same id strictly LESS than that.
-- It is keyed ONLY by the exact id -- no search, no prefix match, no listing --
-- so it adds no enumeration surface.
--
-- WHAT IT RETURNS (and nothing else), or NULL when no plan has that id -- which
-- includes a plan removed by delete_plan (047), a hard delete, so a deleted
-- plan reveals nothing at all:
--   title             already cleaned at write (clean_app_text, 60 chars)
--   status            'open' | 'decided'
--   stage             'pool' | 'final' | 'decided'
--   deadline          timestamptz or null
--   host_first_name   first word of the host's people.display_name, 24 chars
--                     max, or null (no profile / blank). The host chose to
--                     share the link; no OTHER member's name is ever returned.
--   spot_count        number of plan_spots rows
--   event_time        timestamptz or null -- when the outing is, once set
--   winner_name       the winning spot's name (80 chars), ONLY when
--   winner_area       status = 'decided' (its area, 40 chars); null otherwise.
--                     "We're going to X" is the most shared moment, and every
--                     link holder can read the winner after a free anonymous
--                     claim anyway. Capped here because a custom spot's name
--                     is user text written straight into spots.
-- It NEVER returns user ids (created_by_user_id, people.id, auth ids), host
-- tokens or their hashes, participant token hashes, votes, rsvps, ratings,
-- member names, booking owner, any non-winning spot, the plan's own area,
-- budget, origin coordinates or the smart brief.
--
-- DOCUMENTED EXCEPTIONS to .claude/skills/rls-policies: (a) no auth.uid()
-- check -- the whole point is a caller without a session, the second
-- deliberate anon grant after record_security_event; (b) found-vs-NULL is an
-- existence answer, but only for an exact 122-bit id, which is the same
-- answer claim_plan_access already gives any guest session.
--
-- Security definer because the caller has no plan_access row; the fixed
-- search_path = '' and fully qualified names keep it from resolving anything
-- the caller planted. `stable`, read-only, no side effects.

create or replace function public.plan_share_preview(p_plan_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'title', p.title,
    'status', p.status,
    'stage', p.stage,
    'deadline', p.deadline,
    'host_first_name', (
      select nullif(left(split_part(btrim(h.display_name), ' ', 1), 24), '')
      from public.people h
      where p.created_by_user_id is not null
        and h.auth_user_id = p.created_by_user_id
      limit 1
    ),
    'spot_count', (select count(*) from public.plan_spots s where s.plan_id = p.id),
    'event_time', p.event_time,
    'winner_name', w.name,
    'winner_area', w.area
  )
  from public.plans p
  -- The winner only once the plan is decided: a reopened plan keeps no
  -- winner_spot_id today (reopen_plan nulls it), and this guard keeps an open
  -- plan from ever naming a spot even if that changes.
  left join lateral (
    select nullif(left(btrim(s.name), 80), '') as name,
           nullif(left(btrim(s.area), 40), '') as area
    from public.spots s
    where p.status = 'decided' and s.id = p.winner_spot_id
  ) w on true
  where p_plan_id is not null and p.id = p_plan_id
$$;

-- `revoke ... from public` alone leaves Supabase's named anon/authenticated
-- grants standing (the 021/024 bug), so all three are revoked, then execute is
-- granted back explicitly. anon is deliberate: a link crawler has no session.
revoke all on function public.plan_share_preview(uuid) from public, anon, authenticated;
grant execute on function public.plan_share_preview(uuid) to anon, authenticated;
