-- Migration 093: Google place ids for 14 more curated spots, and one closure.
--
-- A second, hand-queried pass (name + landmark) for venues places:backfill
-- could not match with confidence. Each result was read and kept only when it
-- is the same venue; different branches and different places were skipped.
-- Place id only (Maps terms). The Lime Tree Cafe is marked permanently closed
-- on Google, so it leaves the catalogue (visibility private; its row stays for
-- any visit that references it). Re-run safe.

begin;

update public.spots s set google_place_id = v.pid, places_synced_at = now()
from (values
  ('c0890000-0000-0000-0002-00001422207c'::uuid, 'ChIJiQKFpPZrXz4RD_y_Rb_TCmI'),
  ('c0890000-0000-0000-0002-00000c4cce8d'::uuid, 'ChIJb54uLhFdXz4RPr-RUVzvLnA'),
  ('8b000000-0000-0000-0000-000000000001'::uuid, 'ChIJFxCH3HZvXz4Rz8fIvmm2WZM'),
  ('c0890000-0000-0000-0001-0000dd965b81'::uuid, 'ChIJwxJBb1FrXz4RTGNIk3yn7g0'),
  ('c0890000-0000-0000-0001-0002bdcf5313'::uuid, 'ChIJk2rzLZZpXz4RR1Qo4xOoiHc'),
  ('8b000000-0000-0000-0000-000000000002'::uuid, 'ChIJr1u9TfQf9T4R7_vND3mMElo'),
  ('50000000-0000-0000-0000-000000000002'::uuid, 'ChIJx46KZgwf9T4RoW-_XZVc_nc'),
  ('c0890000-0000-0000-0001-0000735a1ce6'::uuid, 'ChIJ0Wo4qj8VXz4RmuOI9BArrhc'),
  ('c0890000-0000-0000-0001-000190ed3ceb'::uuid, 'ChIJD2tBKLNsXz4RJIUTCCuTkL4'),
  ('8a000000-0000-0000-0000-000000000001'::uuid, 'ChIJ4S0WnetpXz4R1PyfOTyV03E'),
  ('c0890000-0000-0000-0001-00021185c0e7'::uuid, 'ChIJ38Hn4mlhXz4RB0Wj2ujmHkk'),
  ('c0890000-0000-0000-0001-00013342454a'::uuid, 'ChIJ_UtV6ZFCXz4R5QL0Ge3yvII'),
  ('c0890000-0000-0000-0001-0002651a49cd'::uuid, 'ChIJhTMFgo5rXz4R0ehgq7ZOkxo'),
  ('c0890000-0000-0000-0002-00002a69e650'::uuid, 'ChIJgSOrzbIUXz4R-n3fz7DlWwY')
) as v(id, pid)
where s.id = v.id and s.source = 'curated' and s.google_place_id is null
  and not exists (select 1 from public.spots o where o.google_place_id = v.pid);

update public.spots set visibility = 'private'
  where id = 'c0890000-0000-0000-0001-00009ca062fc' and source = 'curated';

commit;
