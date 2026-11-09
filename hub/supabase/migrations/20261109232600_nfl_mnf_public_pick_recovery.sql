-- One prekick Pikkit launch for Buffalo at Minnesota. The $8 headroom applies
-- only to the exact one-use reservation. Ordinary ceilings, prior debits,
-- pending/active monitoring, context lease and verified close still apply.
set local lock_timeout='2s';
set local statement_timeout='10s';

do $guard$
begin
  if md5(pg_get_functiondef(to_regprocedure('public.nfl_nov8_browserbase_plans()'))) is distinct from '9cd68516225966fabec7059600d50dd1'
    or md5(pg_get_functiondef(to_regprocedure('public.nfl_nov8_browserbase_cutoff(uuid,integer)'))) is distinct from '96122cff12570db7a59f717989dfc9ba'
    or md5(pg_get_functiondef(to_regprocedure('public.pending_nfl_nov8_browserbase_recovery()'))) is distinct from 'fb6ada98d571a38b7f684c7bb6529dc1'
    or md5(pg_get_functiondef(to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])'))) is distinct from '0adcab3dd815b16ab5447cba6e7a39cd'
    or md5(pg_get_functiondef(to_regprocedure('public.mark_browserbase_shared_creating(text,uuid,uuid)'))) is distinct from '51499a0fd8b812cb08d377f265766c56'
  then raise exception 'Shared browser recovery guard changed; review before release'; end if;
end $guard$;

CREATE OR REPLACE FUNCTION public.nfl_nov8_browserbase_plans()
 RETURNS TABLE(id uuid, timeout_seconds integer, games text[], hard_cutoff timestamp with time zone)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  values
    ('e0b31c37-8bf5-4f9e-bd8e-bc2880cba40d'::uuid, 450, array['2026_09_HOU_LAC'], '2026-11-08T21:05:00Z'::timestamptz),
    ('07a97304-e968-4ed6-bd58-67d32fc8d0d4'::uuid, 450, array['2026_09_LV_SF'], '2026-11-08T21:05:00Z'::timestamptz),
    ('eee7c16a-e429-4af3-bc98-618c4b3543e5'::uuid, 450, array['2026_09_ARI_SEA'], '2026-11-08T21:25:00Z'::timestamptz),
    ('30c0431a-9015-404a-b2c9-fd837a631d15'::uuid, 450, array['2026_09_GB_NE'], '2026-11-08T21:25:00Z'::timestamptz),
    ('7f3f6aa7-f2b6-4c6e-9e43-2fa73d991250'::uuid, 450, array['2026_09_TB_CHI'], '2026-11-09T01:20:00Z'::timestamptz),
    ('a65480bc-958b-4098-a905-55850e0cc11f'::uuid, 300,
      array['2026_09_HOU_LAC','2026_09_LV_SF','2026_09_ARI_SEA','2026_09_GB_NE'], '2026-11-08T21:05:00Z'::timestamptz),
    ('5eedef24-a209-4f46-a25f-462d75e9eaba'::uuid, 300, array['2026_09_TB_CHI'], '2026-11-09T01:20:00Z'::timestamptz),
    ('12baecb9-7146-42ed-98a6-ac5963070f57'::uuid, 450, array['2026_09_LV_SF'], '2026-11-08T21:05:00Z'::timestamptz),
    ('8e50f012-0ed0-4592-aaa3-cdb977a1c0d9'::uuid, 300, array['2026_09_BUF_MIN'], '2026-11-10T01:15:00Z'::timestamptz)
$function$;

CREATE OR REPLACE FUNCTION public.nfl_nov8_browserbase_cutoff(p_id uuid, p_timeout integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select min(public.nfl_research_kickoff(s.game_id,p.hard_cutoff))
  from public.nfl_nov8_browserbase_plans() p
  join public.nfl_schedule s on s.game_id=any(p.games)
  where p.id=p_id and p.timeout_seconds=p_timeout and s.gametime is not null
    and s.gameday=(p.hard_cutoff at time zone 'America/New_York')::date and s.away_score is null and s.home_score is null
  group by p.games
  having count(distinct s.game_id)=cardinality(p.games)
$function$;

CREATE OR REPLACE FUNCTION public.pending_nfl_nov8_browserbase_recovery()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
  select coalesce(array_agg(p.id),array[]::uuid[])
  from public.nfl_nov8_browserbase_plans() p
  where statement_timestamp()>='2026-11-08T17:30:00Z'::timestamptz
    and statement_timestamp()+make_interval(secs=>p.timeout_seconds+30)<public.nfl_nov8_browserbase_cutoff(p.id,p.timeout_seconds)
    and exists(select 1 from public.browserbase_shared_budget_state s
      where s.period_id='6391f791-c131-436b-9858-6e0de67a2af1'::uuid
        and statement_timestamp()>=s.starts_at and statement_timestamp()<s.ends_at)
    and not exists(select 1 from public.browserbase_shared_budget_reservations r where r.reservation_id=p.id)
    and (p.id<>'8e50f012-0ed0-4592-aaa3-cdb977a1c0d9'::uuid or (
      statement_timestamp()>='2026-11-09T23:20:00Z'::timestamptz
      and not exists(select 1 from public.nfl_pikkit_picks_snapshot_history
        where game_id='2026_09_BUF_MIN' and captured_at>='2026-11-09T23:20:00Z'::timestamptz)
    ))
$function$;

CREATE OR REPLACE FUNCTION public.apply_browserbase_shared_budget(p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer, p_minutes numeric, p_bytes bigint, p_observed_at timestamp with time zone, p_monitor_id uuid, p_public_games bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET lock_timeout TO '2s'
 SET statement_timeout TO '5s'
AS $function$
declare
  s public.browserbase_shared_budget_state%rowtype;
  now_at timestamptz;
  cost bigint;
  debit integer;
  recovery_id uuid;
  recovery_cutoff timestamptz;
  ceiling integer;
  use_nba_headroom boolean := false;
begin
  if p_project is null or p_project !~ '^[A-Za-z0-9_-]{1,128}$' or p_period is null
    or p_minutes is null or p_minutes not between 0 and 1000000000
    or p_bytes is null or p_bytes not between 0 and 1000000000000000
    or p_observed_at is null or not pg_catalog.isfinite(p_observed_at)
    or (p_id is null and p_timeout_seconds is not null)
    or (p_id is not null and (p_timeout_seconds is null or p_timeout_seconds not between 60 and 450))
  then raise exception 'Invalid admission request'; end if;
  select * into s from public.browserbase_shared_budget_state where project_id=p_project for update;
  if not found or s.period_id<>p_period then return jsonb_build_object('allowed',false,'reason','baseline-unavailable'); end if;
  now_at:=clock_timestamp();
  if now_at<s.starts_at or now_at>=s.ends_at then return jsonb_build_object('allowed',false,'reason','period-closed'); end if;
  if p_observed_at>now_at or p_observed_at<now_at-interval '30 seconds' then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
  if p_observed_at<s.last_observed_at or (p_observed_at=s.last_observed_at and (p_bytes<s.last_bytes or p_minutes<s.last_minutes))
    then return jsonb_build_object('allowed',false,'reason','usage-reordered'); end if;
  if p_bytes<s.last_bytes or p_minutes<s.last_minutes then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
  -- Baseline is deliberately subtracted only when explicitly provisioned;
  -- every post-baseline byte/minute is treated as billable. All reservations
  -- remain additive even after usage reports may already include them.
  cost:=pg_catalog.ceil((p_bytes-s.baseline_bytes)::numeric/1000000 + (p_minutes-s.baseline_minutes)/6)::bigint;
  update public.browserbase_shared_budget_state set last_bytes=p_bytes,last_minutes=p_minutes,last_observed_at=p_observed_at where project_id=p_project;
  ceiling:=s.ceiling_cents;
  recovery_id:=coalesce(p_id,p_monitor_id);
  if exists(select 1 from public.nfl_nov8_browserbase_plans() where id=recovery_id) then
    recovery_cutoff:=public.nfl_nov8_browserbase_cutoff(recovery_id,
      case when p_id is not null then p_timeout_seconds else
        (select timeout_seconds from public.browserbase_shared_budget_reservations
          where reservation_id=p_monitor_id and project_id=p_project and period_id=p_period and nba_enabled=false)
      end);
    if p_period<>'6391f791-c131-436b-9858-6e0de67a2af1'::uuid
      or now_at<'2026-11-08T17:30:00Z'::timestamptz or recovery_cutoff is null
      or now_at+make_interval(secs=>case when p_id is null then 0 else p_timeout_seconds+30 end)>=recovery_cutoff
    then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
    if recovery_id='8e50f012-0ed0-4592-aaa3-cdb977a1c0d9'::uuid then
      if now_at<'2026-11-09T23:20:00Z'::timestamptz or (p_id is not null and exists (
        select 1 from public.nfl_pikkit_picks_snapshot_history
        where game_id='2026_09_BUF_MIN' and captured_at>='2026-11-09T23:20:00Z'::timestamptz
      )) then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
      ceiling:=ceiling+800;
    else
      ceiling:=ceiling+600;
    end if;
  end if;
  if p_id is null then
    if exists (
      select 1 from public.browserbase_shared_budget_reservations r
      where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
        and r.nba_public_headroom and r.nba_enabled and r.nba_workflow='public'
    ) then ceiling:=s.ceiling_cents+1500; end if;
    return jsonb_build_object('allowed',cost+s.reserved_cents<=ceiling,'reason','checked','floorCents',cost+s.reserved_cents);
  end if;
  if exists(select 1 from public.browserbase_shared_budget_reservations where reservation_id=p_id) then
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  -- Only pending is provably pre-create. The caller must atomically mark
  -- creating before sending the SDK POST; a late caller can no longer do so
  -- after this CAS cleanup, so abandoned lost-response reservations can recover
  -- without a refund. Creating/active/closing never clear by time alone.
  update public.browserbase_shared_budget_reservations set status='closed',closed_at=now_at
    where project_id=p_project and status='pending' and created_at<now_at-interval '60 seconds';
  -- Every unresolved reservation blocks every further launch, across periods.
  -- The runtime clears attempted creates only after exact remote completion.
  if exists(select 1 from public.browserbase_shared_budget_reservations r where r.project_id=p_project
    and r.status<>'closed')
    then return jsonb_build_object('allowed',false,'reason','session-unverified'); end if;
  -- An estimate, not a hard per-session byte limit.
  debit:=50+pg_catalog.ceil(p_timeout_seconds::numeric/360)::integer;
  if cost+s.reserved_cents+debit>ceiling then
    -- Only this exact NBA public batch may access the extra period headroom.
    -- Keep the whole batch so a single browser can cover later tips too.
    if p_public_games is null or cardinality(p_public_games) not between 1 and 100
      or p_timeout_seconds>300 or cost+s.reserved_cents+debit>s.ceiling_cents+1500
      or not exists (
        select 1
        from public.nba_games g
        left join public.nba_odds_phase_games o on o.game_id=g.id
        left join public.nba_pregame_research f
          on f.game_id=g.id and f.resource='board:v1' and f.version=1
        cross join lateral (select least((g.payload->>'datetime')::timestamptz,o.tipoff_at,f.tipoff_at) as tip) schedule
        where g.id=any(p_public_games)
          and coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown')
          and schedule.tip>now_at and schedule.tip<=now_at+interval '2 hours'
          and not exists (
            select 1 from public.nba_public_captures c
            where c.game_id=g.id and c.captured_at>=schedule.tip-interval '2 hours'
              and c.captured_at<=now_at
              and 4=(
                select count(distinct m->>'value')
                from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'marketStates')='array'
                  then c.snapshot->'marketStates' else '[]'::jsonb end) m
                where m->>'value' in ('points','rebounds','assists','threes')
                  and m->>'status'='captured' and (m->>'rows')::integer>0
                  and (m->>'observedAt')::timestamptz>=schedule.tip-interval '2 hours'
                  and (m->>'observedAt')::timestamptz<=now_at
              )
          )
      )
      or (
        select count(*) from public.browserbase_shared_budget_reservations r
        where r.project_id=p_project and r.period_id=p_period and r.nba_public_headroom
          and r.created_at>=greatest(s.starts_at,date_trunc('day',now_at,'America/New_York'))
      )>=4
    then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
    use_nba_headroom:=true;
  end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds,nba_public_headroom)
    values(p_id,p_project,p_period,debit,p_timeout_seconds,use_nba_headroom);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $function$;
