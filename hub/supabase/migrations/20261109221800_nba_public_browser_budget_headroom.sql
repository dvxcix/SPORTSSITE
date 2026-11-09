-- Recurring NBA public-count headroom within the provisioned Browserbase period.
-- Keep the existing shared ceiling for NFL and direct-book browsers. Only the
-- existing public collector with an upcoming batch may use up to $15 more in
-- the guard, at no more than four additional admissions per Eastern day.
-- No new schedule, baseline reset, reservation refund or replay.
set local lock_timeout='2s';
set local statement_timeout='10s';

do $guard$
begin
  if md5(pg_get_functiondef(to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid)'))) is distinct from 'f35501e2d936a7ef9b50c405b88c228e'
    or md5(pg_get_functiondef(to_regprocedure('public.reserve_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from 'ed10c0cb60982dec0aed06083cc9f402'
    or md5(pg_get_functiondef(to_regprocedure('public.check_browserbase_shared_budget(text,uuid,uuid,text,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from '0e3866c3afc49665c28381e8eba15993'
  then raise exception 'Shared browser guard changed; review before release'; end if;
end $guard$;

alter table public.browserbase_shared_budget_reservations
  add column nba_public_headroom boolean not null default false;

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
    ceiling:=ceiling+600;
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
              and c.snapshot->'rows' @> '[{"market":"points"},{"market":"rebounds"},{"market":"assists"},{"market":"threes"}]'::jsonb
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
end $function$
;
revoke all on function public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid,bigint[]) from public,anon,authenticated,service_role;

create or replace function public.apply_browserbase_shared_budget(
  p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer,
  p_minutes numeric, p_bytes bigint, p_observed_at timestamptz, p_monitor_id uuid
) returns jsonb language sql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $wrapper$
  select public.apply_browserbase_shared_budget(p_project,p_period,p_id,p_timeout_seconds,p_minutes,p_bytes,p_observed_at,p_monitor_id,null)
$wrapper$;

CREATE OR REPLACE FUNCTION public.reserve_browserbase_shared_budget(p_project text, p_period uuid, p_id uuid, p_timeout integer, p_minutes numeric, p_bytes bigint, p_observed_at timestamp with time zone, p_nba boolean, p_daily_sessions integer, p_period_sessions integer, p_daily_minutes integer, p_period_minutes integer, p_reset_day integer, p_daily_cents integer, p_period_cents integer, p_workflow text, p_game_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '2s'
 SET statement_timeout TO '5s'
AS $function$
declare
  global_result jsonb;
  nba_result jsonb;
begin
  if p_id is null or p_nba is null then raise exception 'Invalid admission request'; end if;
  if not p_nba and (p_daily_sessions is not null or p_period_sessions is not null or p_daily_minutes is not null
    or p_period_minutes is not null or p_reset_day is not null or p_daily_cents is not null or p_period_cents is not null
    or p_workflow is not null or p_game_ids is not null) then raise exception 'Unexpected NBA policy'; end if;
  if p_nba and exists(select 1 from public.nfl_nov8_browserbase_plans() where id=p_id)
    then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
  -- PL/pgSQL exception block is a subtransaction: an NBA denial or exception
  -- rolls back the global debit and any partial NBA state before returning.
  begin
    global_result:=public.apply_browserbase_shared_budget(p_project,p_period,p_id,p_timeout,p_minutes,p_bytes,p_observed_at,null,
      case when p_nba and p_workflow='public' then p_game_ids end);
    if global_result->>'allowed' is distinct from 'true' or global_result->>'reason' is distinct from 'reserved' then
      return jsonb_build_object('allowed',false,'reason',coalesce(global_result->>'reason','global-unavailable'));
    end if;
    if p_nba then
      nba_result:=public.apply_nba_browser_spend_budget(p_id,p_project,p_timeout,p_daily_sessions,p_period_sessions,
        p_daily_minutes,p_period_minutes,p_reset_day,p_minutes,p_bytes,p_observed_at,p_daily_cents,p_period_cents,p_workflow,p_game_ids);
      if nba_result->>'allowed'='false' and nba_result->>'reason'='usage-reordered' then
        raise exception using errcode='PNA02',message='NBA usage reordered';
      end if;
      if nba_result->>'allowed' is distinct from 'true' or nba_result->>'reason' is distinct from 'reserved'
        or nba_result->>'id' is distinct from p_id::text
        or (nba_result->>'day') is null or (nba_result->>'day') !~ '^\d{4}-\d{2}-\d{2}$'
        or (nba_result->>'day')::date <> (clock_timestamp() at time zone 'UTC')::date then
        raise exception using errcode='PNA01',message='NBA admission denied';
      end if;
    end if;
    -- Bind monitoring to the exact policy and scope that was admitted.
    update public.browserbase_shared_budget_reservations set
      nba_enabled=p_nba,nba_day=case when p_nba then (nba_result->>'day')::date else null end,
      nba_daily_sessions=p_daily_sessions,nba_period_sessions=p_period_sessions,
      nba_daily_minutes=p_daily_minutes,nba_period_minutes=p_period_minutes,nba_reset_day=p_reset_day,
      nba_daily_cents=p_daily_cents,nba_period_cents=p_period_cents,nba_workflow=p_workflow,nba_game_ids=p_game_ids
      where reservation_id=p_id and project_id=p_project and period_id=p_period and status='pending';
    if not found then raise exception 'Reservation unavailable'; end if;
    return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'global',global_result,'nba',nba_result);
  exception when sqlstate 'PNA01' then
    return jsonb_build_object('allowed',false,'reason','nba-denied');
  when sqlstate 'PNA02' then
    return jsonb_build_object('allowed',false,'reason','usage-reordered');
  end;
end $function$
;
