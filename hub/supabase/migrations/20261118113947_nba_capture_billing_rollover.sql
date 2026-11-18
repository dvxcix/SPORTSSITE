-- Repair reviewed 2026-11-18. Provider usage reset confirmed in signed-in admin
-- diagnostics: 0 browser hours / 0 proxy GB, no running sessions. Existing usage
-- ledgers retain the old cycle; the new epoch only adds usage, never refunds.
-- No jobs, schedules, sessions, secrets or historical captures are created here.
set lock_timeout='2s';
set statement_timeout='15s';
do $guard$ begin
 if md5(pg_get_functiondef('public.reserve_browserbase_shared_budget(text, uuid, uuid, integer, numeric, bigint, timestamp with time zone, boolean, integer, integer, integer, integer, integer, integer, integer, text, bigint[])'::regprocedure))<>'905ec1a86a17040184585e08bfe0d60e' then raise exception 'Live capture definition changed: reserve_browserbase_shared_budget'; end if;
 if md5(pg_get_functiondef('public.check_browserbase_shared_budget(text, uuid, uuid, text, integer, numeric, bigint, timestamp with time zone, boolean, integer, integer, integer, integer, integer, integer, integer, text, bigint[])'::regprocedure))<>'0e3866c3afc49665c28381e8eba15993' then raise exception 'Live capture definition changed: check_browserbase_shared_budget'; end if;
 if md5(pg_get_functiondef('public.nba_pregame_pick_admission_due(bigint[], timestamp with time zone)'::regprocedure))<>'edb63a09c8e39dd7a227ad6a1c76f5a0' then raise exception 'Live capture definition changed: nba_pregame_pick_admission_due'; end if;
 if md5(pg_get_functiondef('public.apply_browserbase_shared_budget(text, uuid, uuid, integer, numeric, bigint, timestamp with time zone, uuid, bigint[])'::regprocedure))<>'c7c6ceeeb31cc9f7c5cd5becc920e58c' then raise exception 'Live capture definition changed: apply_browserbase_shared_budget'; end if;
end $guard$;


-- Provider counters reset on the configured UTC billing day (18), independently
-- of Eastern slate days. Keep an append-only epoch and add the prior usage floor
-- to every new counter so no historical spend or reservation is refunded.
create table public.browserbase_usage_epochs (
 project_id text not null,
 starts_on date not null,
 offset_minutes numeric not null check(offset_minutes>=0),
 offset_bytes bigint not null check(offset_bytes>=0),
 raw_minutes numeric not null check(raw_minutes>=0),
 raw_bytes bigint not null check(raw_bytes>=0),
 observed_at timestamptz not null,
 primary key(project_id,starts_on)
);
alter table public.browserbase_usage_epochs enable row level security;
revoke all on public.browserbase_usage_epochs from public,anon,authenticated,service_role;
insert into public.browserbase_usage_epochs
 select s.project_id,w.starts_on,0,0,s.last_minutes,s.last_bytes,s.last_observed_at
 from public.browserbase_shared_budget_state s
 join lateral(select starts_on from public.nba_browser_spend_windows w
  where w.project_id=s.project_id and w.kind='period' order by starts_on desc limit 1) w on true;

create function public.normalize_browserbase_usage(p_project text,p_minutes numeric,p_bytes bigint,p_observed_at timestamptz)
 returns jsonb language plpgsql set search_path='' set lock_timeout='2s' set statement_timeout='5s'
as $fn$
declare e public.browserbase_usage_epochs%rowtype; v_reset integer; v_period date; v_now timestamptz:=clock_timestamp();
begin
 if p_minutes is null or p_minutes not between 0 and 1000000000 or p_bytes is null or p_bytes not between 0 and 1000000000000000
  or p_observed_at is null or p_observed_at>v_now or p_observed_at<v_now-interval '30 seconds'
 then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
 -- Same lock ordering as the shared admission path; no create can race rollover.
 perform 1 from public.browserbase_shared_budget_state where project_id=p_project for update;
 if not found then return jsonb_build_object('allowed',false,'reason','baseline-unavailable'); end if;
 select * into e from public.browserbase_usage_epochs where project_id=p_project order by starts_on desc limit 1 for update;
 if not found then return jsonb_build_object('allowed',false,'reason','baseline-unavailable'); end if;
 if p_observed_at<e.observed_at then return jsonb_build_object('allowed',false,'reason','usage-reordered'); end if;
 select reset_day into v_reset from public.nba_browser_budget_projects where project_id=p_project;
 if v_reset is null then return jsonb_build_object('allowed',false,'reason','baseline-unavailable'); end if;
 v_period:=make_date(extract(year from v_now)::integer,extract(month from v_now)::integer,v_reset);
 if v_period>(v_now at time zone 'UTC')::date then v_period:=(v_period-interval '1 month')::date; end if;
 if p_minutes<e.raw_minutes or p_bytes<e.raw_bytes then
  -- A mid-period decrease, partial/inconsistent reset or reordered read remains
  -- a denial. Rollover requires the configured new cycle AND both meters down.
  if v_period<=e.starts_on or p_observed_at<=e.observed_at or p_minutes>e.raw_minutes or p_bytes>e.raw_bytes
   then return jsonb_build_object('allowed',false,'reason','usage-unavailable'); end if;
  insert into public.browserbase_usage_epochs values
   (p_project,v_period,e.offset_minutes+e.raw_minutes,e.offset_bytes+e.raw_bytes,p_minutes,p_bytes,p_observed_at)
   returning * into e;
 else
  update public.browserbase_usage_epochs set raw_minutes=p_minutes,raw_bytes=p_bytes,observed_at=p_observed_at
   where project_id=p_project and starts_on=e.starts_on returning * into e;
 end if;
 return jsonb_build_object('allowed',true,'minutes',e.offset_minutes+p_minutes,'bytes',e.offset_bytes+p_bytes);
end $fn$;
revoke all on function public.normalize_browserbase_usage(text,numeric,bigint,timestamptz) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nba_pregame_pick_admission_due(p_games bigint[], p_now timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
        when tip<=p_now+interval '12 hours' then tip-interval '12 hours'
        else tip-interval '24 hours' end as checkpoint
    from upcoming where tip>p_now and tip<=p_now+interval '24 hours'
  )
  select coalesce(cardinality(p_games) between 1 and 100
    and (select count(*) from valid)=cardinality(p_games)
    and exists (
      select 1 from valid v
      where not exists (
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
$function$
;
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
  public_session_limit integer;
  use_pregame_pick_admission boolean := false;
  nfl_public_pick_cutoff timestamptz;
  nfl_fanduel_cutoff timestamptz;
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
  if p_id is null then
    select r.nfl_public_pick_cutoff,r.nfl_fanduel_cutoff into nfl_public_pick_cutoff,nfl_fanduel_cutoff
    from public.browserbase_shared_budget_reservations r
    where r.reservation_id=p_monitor_id and r.project_id=p_project and r.period_id=p_period
      and r.nba_enabled is false;
  elsif p_public_games is null and exists (
    select 1 from public.nba_source_cache c where c.key='nfl:browser:v1:public-batch:'||p_id::text
  ) then
    nfl_public_pick_cutoff:=public.nfl_public_pick_batch_cutoff(p_id,now_at);
    if p_timeout_seconds>300 or nfl_public_pick_cutoff is null
      or now_at+make_interval(secs=>p_timeout_seconds+30)>=nfl_public_pick_cutoff then
      return jsonb_build_object('allowed',false,'reason','spend-limit');
    end if;
  elsif p_public_games is null and exists (
    select 1 from public.nba_source_cache c where c.key='nfl:browser:v1:fanduel-batch:'||p_id::text
  ) then
    nfl_fanduel_cutoff:=public.nfl_fanduel_batch_cutoff(p_id,now_at);
    if nfl_fanduel_cutoff is null or now_at+make_interval(secs=>p_timeout_seconds+30)>=nfl_fanduel_cutoff then
      return jsonb_build_object('allowed',false,'reason','spend-limit');
    end if;
  end if;
  if now_at<s.starts_at or (now_at>=s.ends_at and not use_pregame_pick_admission
      and nfl_public_pick_cutoff is null and nfl_fanduel_cutoff is null) then
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
    if coalesce(nfl_public_pick_cutoff,nfl_fanduel_cutoff) is not null then
      return jsonb_build_object('allowed',now_at<coalesce(nfl_public_pick_cutoff,nfl_fanduel_cutoff),'reason','checked','floorCents',cost+s.reserved_cents);
    end if;
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
    -- Capacity scales with scheduled games, not a six-session cliff. Normal
    -- per-game checkpoint/backoff controls still decide which games are due.
    -- Count this slate and the next day's baseline work; never exceed 60/day.
    select greatest(8,least(60,4*count(distinct g.id)::integer)) into public_session_limit
     from public.nba_games g
     where coalesce(g.payload->>'status_state','unknown') in ('scheduled','unknown')
      and (g.payload->>'datetime')::timestamptz>=date_trunc('day',now_at,'America/New_York')
      and (g.payload->>'datetime')::timestamptz<date_trunc('day',now_at,'America/New_York')+interval '48 hours';
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.created_at>=date_trunc('day',now_at,'America/New_York')
        and (r.nba_pregame_pick_admission or r.nba_enabled and r.nba_workflow='public')
    )>=public_session_limit then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif nfl_public_pick_cutoff is not null then
    -- The shared state lock above serializes this limit and counts ambiguous launches.
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.nfl_public_pick_cutoff is not null
        and r.created_at>=date_trunc('day',now_at,'America/New_York')
    )>=12 then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif nfl_fanduel_cutoff is not null then
    if (
      select count(*) from public.browserbase_shared_budget_reservations r
      where r.project_id=p_project and r.nfl_fanduel_cutoff is not null
        and r.created_at>=date_trunc('day',now_at,'America/New_York')
    )>=16 then
      return jsonb_build_object('allowed',false,'reason','daily-session-limit');
    end if;
  elsif cost+s.reserved_cents+debit>ceiling then
    return jsonb_build_object('allowed',false,'reason','spend-limit');
  end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds,nba_pregame_pick_admission,nfl_public_pick_cutoff,nfl_fanduel_cutoff)
    values(p_id,p_project,p_period,debit,p_timeout_seconds,use_pregame_pick_admission,nfl_public_pick_cutoff,nfl_fanduel_cutoff);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $function$
;
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
  usage_result jsonb;
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
    usage_result:=public.normalize_browserbase_usage(p_project,p_minutes,p_bytes,p_observed_at);
    if usage_result->>'allowed' is distinct from 'true' then return usage_result; end if;
    p_minutes:=(usage_result->>'minutes')::numeric;
    p_bytes:=(usage_result->>'bytes')::bigint;
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
    return jsonb_build_object('allowed',false,'reason',case when nba_result->>'reason' in ('usage-decreased','usage-stale','usage-reordered') then 'usage-unavailable' else 'nba-denied' end);
  when sqlstate 'PNA02' then
    return jsonb_build_object('allowed',false,'reason','usage-reordered');
  end;
end $function$
;
CREATE OR REPLACE FUNCTION public.check_browserbase_shared_budget(p_project text, p_period uuid, p_id uuid, p_session_id text, p_timeout integer, p_minutes numeric, p_bytes bigint, p_observed_at timestamp with time zone, p_nba boolean, p_daily_sessions integer, p_period_sessions integer, p_daily_minutes integer, p_period_minutes integer, p_reset_day integer, p_daily_cents integer, p_period_cents integer, p_workflow text, p_game_ids bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '2s'
 SET statement_timeout TO '5s'
AS $function$
declare global_result jsonb; nba_result jsonb; usage_result jsonb;
begin
  if p_nba is null or p_id is null or p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Invalid monitor request'; end if;
  -- Never allow a monitor to omit NBA checks, switch game scope, or widen any
  -- policy after creation. Compare before touching either budget ledger.
  if not exists(select 1 from public.browserbase_shared_budget_reservations r
    where r.reservation_id=p_id and r.project_id=p_project and r.period_id=p_period
      and r.timeout_seconds=p_timeout and r.nba_enabled=p_nba
      and r.nba_daily_sessions is not distinct from p_daily_sessions and r.nba_period_sessions is not distinct from p_period_sessions
      and r.nba_daily_minutes is not distinct from p_daily_minutes and r.nba_period_minutes is not distinct from p_period_minutes
      and r.nba_reset_day is not distinct from p_reset_day and r.nba_daily_cents is not distinct from p_daily_cents
      and r.nba_period_cents is not distinct from p_period_cents and r.nba_workflow is not distinct from p_workflow
      and r.nba_game_ids is not distinct from p_game_ids
      and (r.status='creating' or (r.status='active' and r.remote_session_id=p_session_id)))
    then return jsonb_build_object('allowed',false,'reason','session-unverified'); end if;
  usage_result:=public.normalize_browserbase_usage(p_project,p_minutes,p_bytes,p_observed_at);
  if usage_result->>'allowed' is distinct from 'true' then return usage_result; end if;
  p_minutes:=(usage_result->>'minutes')::numeric;
  p_bytes:=(usage_result->>'bytes')::bigint;
  global_result:=public.apply_browserbase_shared_budget(p_project,p_period,null,null,p_minutes,p_bytes,p_observed_at,p_id);
  if global_result->>'allowed' is distinct from 'true' or global_result->>'reason' is distinct from 'checked' then
    return jsonb_build_object('allowed',false,'reason',case when global_result->>'reason'='usage-reordered' then 'usage-reordered' else 'global-unavailable' end);
  end if;
  if p_nba then
    nba_result:=public.apply_nba_browser_spend_budget(null,p_project,null,p_daily_sessions,p_period_sessions,
      p_daily_minutes,p_period_minutes,p_reset_day,p_minutes,p_bytes,p_observed_at,p_daily_cents,p_period_cents,p_workflow,p_game_ids);
    if nba_result->>'allowed' is distinct from 'true' or nba_result->>'reason' is distinct from 'checked' then
      return jsonb_build_object('allowed',false,'reason',case when nba_result->>'reason'='usage-reordered' then 'usage-reordered' else 'nba-unavailable' end);
    end if;
  end if;
  -- A successful current usage check both registers the just-created session
  -- and refreshes its heartbeat. A missing/wrong/closing token fails closed.
  update public.browserbase_shared_budget_reservations
    set status='active',remote_session_id=p_session_id,heartbeat_at=clock_timestamp()
    where reservation_id=p_id and project_id=p_project and period_id=p_period
      and (status='creating' or (status='active' and remote_session_id=p_session_id));
  if not found then return jsonb_build_object('allowed',false,'reason','session-unverified'); end if;
  return jsonb_build_object('allowed',true,'reason','checked','global',global_result,'nba',nba_result);
end $function$
;

-- Real PostgreSQL regression tests. The inner exception rolls back all fixture
-- data/reservations; no provider call is made and no existing project is changed.
do $tests$
declare
 p text:='capture_rollover_fixture_'||replace(gen_random_uuid()::text,'-','');
 per uuid:=gen_random_uuid(); rid uuid; out jsonb; ep date;
 now_at timestamptz:=clock_timestamp(); ids bigint[]; i integer;
begin
 begin
  ep:=make_date(extract(year from now_at)::integer,extract(month from now_at)::integer,18);
  if ep>(now_at at time zone 'UTC')::date then ep:=(ep-interval '1 month')::date; end if;
  insert into public.browserbase_shared_budget_state(project_id,period_id,starts_at,ends_at,baseline_bytes,baseline_minutes,last_bytes,last_minutes,last_observed_at,reserved_cents,ceiling_cents)
   values(p,per,now_at-interval '16 days',now_at-interval '1 second',0,0,100000,150,now_at-interval '10 seconds',700,10000);
  insert into public.nba_browser_budget_projects(project_id,reset_day) values(p,18);
  insert into public.browserbase_usage_epochs values(p,(ep-interval '1 month')::date,0,0,150,100000,now_at-interval '10 seconds');
  out:=public.normalize_browserbase_usage(p,0,0,clock_timestamp());
  if out->>'allowed'<>'true' or (out->>'minutes')::numeric<>150 or (out->>'bytes')::bigint<>100000
   or (select count(*) from public.browserbase_usage_epochs where project_id=p)<>2 then raise exception 'Rollover failed: %',out; end if;
  out:=public.normalize_browserbase_usage(p,5,200,clock_timestamp());
  if (out->>'minutes')::numeric<>155 or (out->>'bytes')::bigint<>100200 then raise exception 'New-cycle additive usage failed'; end if;
  out:=public.normalize_browserbase_usage(p,4,201,clock_timestamp());
  if out->>'allowed'<>'false' then raise exception 'Mid-cycle decrease accepted'; end if;
  out:=public.normalize_browserbase_usage(p,5,200,clock_timestamp()-interval '40 seconds');
  if out->>'allowed'<>'false' then raise exception 'Stale provider usage accepted'; end if;
  out:=public.normalize_browserbase_usage(p,5,200,now_at-interval '5 seconds');
  if out->>'reason'<>'usage-reordered' then raise exception 'Reordered usage accepted'; end if;
  select array_agg(id order by id) into ids from (
    select id from public.nba_games where coalesce(payload->>'status_state','unknown') in('scheduled','unknown')
     and (payload->>'datetime')::timestamptz>clock_timestamp()+interval '6 hours'
     and (payload->>'datetime')::timestamptz<clock_timestamp()+interval '24 hours' order by id limit 12
  ) g;
  if coalesce(cardinality(ids),0)=0 then raise exception 'No early pregame fixture games available'; end if;
  if not public.nba_pregame_pick_admission_due(ids,clock_timestamp()) then raise exception 'Early checkpoints still blocked'; end if;
  if public.nba_pregame_pick_admission_due(array[ids[1],ids[1]],clock_timestamp()) then raise exception 'Duplicate scope accepted'; end if;
  if public.nba_pregame_pick_admission_due(ids,clock_timestamp()+interval '2 days') then raise exception 'Post-tip scope accepted'; end if;
  for i in 1..8 loop
   rid:=gen_random_uuid();
   out:=public.reserve_browserbase_shared_budget(p,per,rid,300,5,200,clock_timestamp(),true,1000,10000,30000,30000,18,300,5000,'public',ids);
   if out->>'allowed'<>'true' then raise exception 'Scheduled coverage reservation % denied: %',i,out; end if;
   if i=1 then
    out:=public.mark_browserbase_shared_creating(p,per,rid);
    if out->>'marked'<>'true' then raise exception 'New-cycle create denied'; end if;
    out:=public.check_browserbase_shared_budget(p,per,rid,'fixture-session',300,5,200,clock_timestamp(),true,1000,10000,30000,30000,18,300,5000,'public',ids);
    if out->>'allowed'<>'true' then raise exception 'New-cycle monitor denied: %',out; end if;
    perform public.mark_browserbase_shared_closing(p,per,rid,'fixture-session');
    perform public.resolve_browserbase_shared_session(p,per,rid,'fixture-session');
   else
    if not public.abandon_browserbase_shared_before_create(p,per,rid) then raise exception 'Fixture pre-create close failed'; end if;
   end if;
  end loop;
  if (select reserved_cents from public.browserbase_shared_budget_state where project_id=p)<>700+8*51
   then raise exception 'Historical debit changed'; end if;
  raise exception using errcode='PZT01',message='Capture repair regressions passed';
 exception when sqlstate 'PZT01' then null;
 end;
 if exists(select 1 from public.browserbase_shared_budget_state where project_id=p)
  then raise exception 'Fixture escaped rollback'; end if;
end $tests$;
