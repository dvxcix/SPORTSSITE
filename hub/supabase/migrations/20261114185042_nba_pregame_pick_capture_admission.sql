-- Keep scheduled pregame NBA public picks available independently of the
-- shared dollar ceiling and its provisioned period. Preserve accounting,
-- provider usage verification, context lock, timeouts and release safeguards.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $migration_guard$
begin
  if md5(pg_get_functiondef(to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[])'))) is distinct from '09fbb7994a2a0815143ac095692ca9da'
    or md5(pg_get_functiondef(to_regprocedure('public.mark_browserbase_shared_creating(text,uuid,uuid)'))) is distinct from '51499a0fd8b812cb08d377f265766c56'
    or md5(pg_get_functiondef(to_regprocedure('public.reserve_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from '905ec1a86a17040184585e08bfe0d60e'
    or md5(pg_get_functiondef(to_regprocedure('public.check_browserbase_shared_budget(text,uuid,uuid,text,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from '0e3866c3afc49665c28381e8eba15993'
    or md5(pg_get_functiondef(to_regprocedure('public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text,bigint[])'))) is distinct from '1b75c417ad6733e31a0998edccb7c412'
  then
    raise exception 'Browserbase admission definitions changed; review NBA pick migration';
  end if;
end
$migration_guard$;

alter table public.browserbase_shared_budget_reservations
  add column nba_pregame_pick_admission boolean not null default false;

-- A batch may include future games routed by the existing scheduler. At least
-- one eligible game must be missing a complete board for the T-4h or T-1h
-- checkpoint. A missing baseline can catch up starting at T-6h. A mixed
-- batch containing a started game is denied.
create function public.nba_pregame_pick_admission_due(p_games bigint[], p_now timestamptz)
returns boolean
language sql stable
set search_path = ''
as $due$
  with upcoming as (
    select g.id,
      least((g.payload->>'datetime')::timestamptz, o.tipoff_at, f.tipoff_at) as tip
    from public.nba_games g
    left join public.nba_odds_phase_games o on o.game_id=g.id
    left join public.nba_pregame_research f
      on f.game_id=g.id and f.resource='board:v1' and f.version=1
    where g.id=any(p_games)
      and coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown')
  ),
  valid as (
    select id, tip,
      case when tip<=p_now+interval '1 hour' then tip-interval '1 hour'
        when tip<=p_now+interval '4 hours' then tip-interval '4 hours'
        else tip-interval '12 hours' end as checkpoint
    from upcoming where tip>p_now and tip<=p_now+interval '24 hours'
  )
  select coalesce(cardinality(p_games) between 1 and 100
    and (select count(*) from valid)=cardinality(p_games)
    and exists (
      select 1 from valid v
      where v.tip<=p_now+interval '6 hours'
        and not exists (
          select 1 from public.nba_public_captures c
          where c.game_id=v.id and c.captured_at between v.checkpoint and p_now
            and 4=(
              select count(distinct m->>'value')
              from jsonb_array_elements(case when jsonb_typeof(c.snapshot->'marketStates')='array'
                then c.snapshot->'marketStates' else '[]'::jsonb end) m
              where m->>'value' in ('points','rebounds','assists','threes')
                and m->>'status'='captured' and (m->>'rows')::integer>0
                and (m->>'observedAt')::timestamptz between v.checkpoint and p_now
            )
        )
    ), false)
$due$;

revoke all on function public.nba_pregame_pick_admission_due(bigint[],timestamptz)
  from public,anon,authenticated,service_role;

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
  use_pregame_pick_admission boolean := false;
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
  -- The public pick exception is attached to the reservation and usable by
  -- that session's monitor after the old spending period has ended.
  if p_id is null then
    select exists (
      select 1 from public.browserbase_shared_budget_reservations r
      where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
        and r.nba_pregame_pick_admission and r.nba_enabled and r.nba_workflow='public'
    ) into use_pregame_pick_admission;
  elsif p_public_games is not null and p_timeout_seconds<=300 then
    use_pregame_pick_admission := public.nba_pregame_pick_admission_due(p_public_games, now_at);
  end if;
  if now_at<s.starts_at or (now_at>=s.ends_at and not use_pregame_pick_admission) then
    return jsonb_build_object('allowed',false,'reason','period-closed');
  end if;
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
    if use_pregame_pick_admission then
      return jsonb_build_object('allowed',true,'reason','checked','floorCents',cost+s.reserved_cents);
    end if;
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
  if use_pregame_pick_admission then
    -- Failed and ambiguous launches count too. The project row lock above
    -- serializes the Eastern slate-day limit with all other launch attempts.
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.created_at>=date_trunc('day',now_at,'America/New_York')
        and (r.nba_pregame_pick_admission or r.nba_enabled and r.nba_workflow='public')
    )>=6 then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif cost+s.reserved_cents+debit>ceiling then
    return jsonb_build_object('allowed',false,'reason','spend-limit');
  end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds,nba_pregame_pick_admission)
    values(p_id,p_project,p_period,debit,p_timeout_seconds,use_pregame_pick_admission);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_browserbase_shared_creating(p_project text, p_period uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '2s'
 SET statement_timeout TO '5s'
AS $function$
declare s public.browserbase_shared_budget_state%rowtype; r public.browserbase_shared_budget_reservations%rowtype; now_at timestamptz; deadline timestamptz; recovery_cutoff timestamptz;
begin
  select * into s from public.browserbase_shared_budget_state where project_id=p_project and period_id=p_period for update;
  if not found then return jsonb_build_object('marked',false); end if;
  now_at:=clock_timestamp();
  if now_at<s.starts_at then return jsonb_build_object('marked',false); end if;
  select * into r from public.browserbase_shared_budget_reservations
    where reservation_id=p_id and project_id=p_project and period_id=p_period and status='pending'
      and nba_enabled is not null and (not nba_enabled or nba_day=(now_at at time zone 'UTC')::date)
      and created_at>=now_at-interval '30 seconds';
  if not found then return jsonb_build_object('marked',false); end if;
  if r.nba_pregame_pick_admission then
    if not r.nba_enabled or r.nba_workflow is distinct from 'public'
      or not public.nba_pregame_pick_admission_due(r.nba_game_ids, now_at) then
      return jsonb_build_object('marked',false);
    end if;
    deadline:=((r.nba_day+1)::timestamp at time zone 'UTC')-interval '60 seconds';
  else
    deadline:=public.browserbase_shared_create_deadline(s.ends_at,r.nba_enabled,r.nba_day);
  end if;
  if exists(select 1 from public.nfl_nov8_browserbase_plans() where id=p_id) then
    recovery_cutoff:=public.nfl_nov8_browserbase_cutoff(p_id,r.timeout_seconds);
    if recovery_cutoff is null or r.nba_enabled then return jsonb_build_object('marked',false); end if;
    deadline:=least(deadline,recovery_cutoff-make_interval(secs=>r.timeout_seconds+30));
  end if;
  if deadline is null or now_at>=deadline then return jsonb_build_object('marked',false); end if;
  update public.browserbase_shared_budget_reservations set status='creating',creating_at=now_at
    where reservation_id=p_id and project_id=p_project and period_id=p_period and status='pending';
  if not found then return jsonb_build_object('marked',false); end if;
  return jsonb_build_object('marked',true,'notAfter',deadline);
end $function$
;
