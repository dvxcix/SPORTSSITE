-- One verified no-save retry for Raiders at 49ers. The original browser
-- closed after an event-link click timeout. No new spend ceiling or reset.
set lock_timeout='2s';
set statement_timeout='10s';

do $$
begin
  if md5(pg_get_functiondef('public.nfl_nov8_browserbase_plans()'::regprocedure)) is distinct from 'b72ffbc77330fb0497d6e959636b1da7'
    or not exists(select 1 from public.browserbase_shared_budget_reservations
      where reservation_id='07a97304-e968-4ed6-bd58-67d32fc8d0d4'::uuid
        and status='closed' and remote_session_id is not null)
    or exists(select 1 from public.nfl_fanduel_capture_history where game_id='2026_09_LV_SF')
    or clock_timestamp()>='2026-11-08T20:57:00Z'::timestamptz
  then raise exception 'Raiders recovery is unavailable; review live coverage'; end if;
end $$;

create or replace function public.nfl_nov8_browserbase_plans()
returns table(id uuid, timeout_seconds integer, games text[], hard_cutoff timestamptz)
language sql immutable set search_path='' as $$
  values
    ('e0b31c37-8bf5-4f9e-bd8e-bc2880cba40d'::uuid, 450, array['2026_09_HOU_LAC'], '2026-11-08T21:05:00Z'::timestamptz),
    ('07a97304-e968-4ed6-bd58-67d32fc8d0d4'::uuid, 450, array['2026_09_LV_SF'], '2026-11-08T21:05:00Z'::timestamptz),
    ('eee7c16a-e429-4af3-bc98-618c4b3543e5'::uuid, 450, array['2026_09_ARI_SEA'], '2026-11-08T21:25:00Z'::timestamptz),
    ('30c0431a-9015-404a-b2c9-fd837a631d15'::uuid, 450, array['2026_09_GB_NE'], '2026-11-08T21:25:00Z'::timestamptz),
    ('7f3f6aa7-f2b6-4c6e-9e43-2fa73d991250'::uuid, 450, array['2026_09_TB_CHI'], '2026-11-09T01:20:00Z'::timestamptz),
    ('a65480bc-958b-4098-a905-55850e0cc11f'::uuid, 300,
      array['2026_09_HOU_LAC','2026_09_LV_SF','2026_09_ARI_SEA','2026_09_GB_NE'], '2026-11-08T21:05:00Z'::timestamptz),
    ('5eedef24-a209-4f46-a25f-462d75e9eaba'::uuid, 300, array['2026_09_TB_CHI'], '2026-11-09T01:20:00Z'::timestamptz),
    ('12baecb9-7146-42ed-98a6-ac5963070f57'::uuid, 450, array['2026_09_LV_SF'], '2026-11-08T21:05:00Z'::timestamptz)$$;
