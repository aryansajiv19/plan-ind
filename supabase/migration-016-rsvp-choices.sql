-- Clearer post-decision attendance choices. Existing boolean RSVPs remain valid.
alter table rsvps add column if not exists choice text not null default 'coming'
  check (choice in ('coming', 'maybe', 'no'));

-- Backfill legacy false rows as an explicit "can't make it" response.
update rsvps
set choice = case when coming then 'coming' else 'no' end
where choice is null or (choice = 'coming' and not coming);
