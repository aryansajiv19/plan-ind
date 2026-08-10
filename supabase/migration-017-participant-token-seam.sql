-- Participant identity seam. New client writes carry a per-plan browser token
-- hash; legacy name-only rows remain readable during the transition.
alter table votes add column if not exists participant_token_hash text;
alter table rsvps add column if not exists participant_token_hash text;
alter table ratings add column if not exists participant_token_hash text;

create index if not exists votes_participant_token_idx on votes (plan_id, participant_token_hash)
  where participant_token_hash is not null;
create index if not exists rsvps_participant_token_idx on rsvps (plan_id, participant_token_hash)
  where participant_token_hash is not null;
create index if not exists ratings_participant_token_idx on ratings (plan_id, participant_token_hash)
  where participant_token_hash is not null;
