-- One-time owner-authorized recovery for five November 8 NFL games.
-- Ordinary admissions remain at $100. All seven slots use the same project
-- lock, permanent ledger, usage meter, and verified remote-session release.
-- The $6 envelope is a guard estimate, not a provider invoice limit.
set lock_timeout='2s';
set statement_timeout='10s';

do $$
begin
  if md5(pg_get_functiondef(to_regprocedure('public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz)'))) is distinct from '6f069bcd6d2347a6f9d066825e113ff7'
    or md5(pg_get_functiondef(to_regprocedure('public.reserve_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from 'e630d9192ce51ad55debac07ba0d42b6'
    or md5(pg_get_functiondef(to_regprocedure('public.check_browserbase_shared_budget(text,uuid,uuid,text,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[])'))) is distinct from 'a3369d5c416ece1c3de720de033865f9'
    or md5(pg_get_functiondef(to_regprocedure('public.mark_browserbase_shared_creating(text,uuid,uuid)'))) is distinct from '2a38ddb2aa4641791feccc9fd6ae9e01'
  then raise exception 'Shared budget functions changed; review before release'; end if;
end $$;

create function public.nfl_nov8_browserbase_plans()
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
    ('5eedef24-a209-4f46-a25f-462d75e9eaba'::uuid, 300, array['2026_09_TB_CHI'], '2026-11-09T01:20:00Z'::timestamptz)
$$;
revoke all on function public.nfl_nov8_browserbase_plans() from public,anon,authenticated,service_role;

create function public.nfl_nov8_browserbase_cutoff(p_id uuid,p_timeout integer)
returns timestamptz language sql stable set search_path='' as $$
  select min(public.nfl_research_kickoff(s.game_id,p.hard_cutoff))
  from public.nfl_nov8_browserbase_plans() p
  join public.nfl_schedule s on s.game_id=any(p.games)
  where p.id=p_id and p.timeout_seconds=p_timeout and s.gametime is not null
    and s.gameday=date '2026-11-08' and s.away_score is null and s.home_score is null
  group by p.games
  having count(distinct s.game_id)=cardinality(p.games)
$$;
revoke all on function public.nfl_nov8_browserbase_cutoff(uuid,integer) from public,anon,authenticated,service_role;

create function public.pending_nfl_nov8_browserbase_recovery()
returns uuid[] language sql stable security definer set search_path='' set statement_timeout='5s' as $$
  select coalesce(array_agg(p.id),array[]::uuid[])
  from public.nfl_nov8_browserbase_plans() p
  where statement_timestamp()>='2026-11-08T17:30:00Z'::timestamptz
    and statement_timestamp()+make_interval(secs=>p.timeout_seconds+30)<public.nfl_nov8_browserbase_cutoff(p.id,p.timeout_seconds)
    and exists(select 1 from public.browserbase_shared_budget_state s
      where s.period_id='6391f791-c131-436b-9858-6e0de67a2af1'::uuid
        and statement_timestamp()>=s.starts_at and statement_timestamp()<s.ends_at)
    and not exists(select 1 from public.browserbase_shared_budget_reservations r where r.reservation_id=p.id)
$$;
revoke all on function public.pending_nfl_nov8_browserbase_recovery() from public,anon,authenticated,service_role;
grant execute on function public.pending_nfl_nov8_browserbase_recovery() to service_role;

create function public.apply_browserbase_shared_budget(
  p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer,
  p_minutes numeric, p_bytes bigint, p_observed_at timestamptz, p_monitor_id uuid
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare
  s public.browserbase_shared_budget_state%rowtype;
  now_at timestamptz;
  cost bigint;
  debit integer;
  recovery_id uuid;
  recovery_cutoff timestamptz;
  ceiling integer;
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
  if cost+s.reserved_cents+debit>ceiling then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds)
    values(p_id,p_project,p_period,debit,p_timeout_seconds);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $$;

revoke all on function public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,uuid) from public,anon,authenticated,service_role;

create or replace function public.apply_browserbase_shared_budget(
  p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer,
  p_minutes numeric, p_bytes bigint, p_observed_at timestamptz
) returns jsonb language sql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
  select public.apply_browserbase_shared_budget(p_project,p_period,p_id,p_timeout_seconds,p_minutes,p_bytes,p_observed_at,null)
$$;

create or replace function public.reserve_browserbase_shared_budget(
  p_project text,p_period uuid,p_id uuid,p_timeout integer,p_minutes numeric,p_bytes bigint,p_observed_at timestamptz,
  p_nba boolean,p_daily_sessions integer,p_period_sessions integer,p_daily_minutes integer,p_period_minutes integer,
  p_reset_day integer,p_daily_cents integer,p_period_cents integer,p_workflow text,p_game_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
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
    global_result:=public.apply_browserbase_shared_budget(p_project,p_period,p_id,p_timeout,p_minutes,p_bytes,p_observed_at);
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
end $$;

create or replace function public.check_browserbase_shared_budget(
  p_project text,p_period uuid,p_id uuid,p_session_id text,p_timeout integer,p_minutes numeric,p_bytes bigint,p_observed_at timestamptz,
  p_nba boolean,p_daily_sessions integer,p_period_sessions integer,p_daily_minutes integer,p_period_minutes integer,
  p_reset_day integer,p_daily_cents integer,p_period_cents integer,p_workflow text,p_game_ids bigint[]
) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare global_result jsonb; nba_result jsonb;
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
end $$;

create or replace function public.mark_browserbase_shared_creating(p_project text,p_period uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare s public.browserbase_shared_budget_state%rowtype; r public.browserbase_shared_budget_reservations%rowtype; now_at timestamptz; deadline timestamptz; recovery_cutoff timestamptz;
begin
  select * into s from public.browserbase_shared_budget_state where project_id=p_project and period_id=p_period for update;
  if not found then return jsonb_build_object('marked',false); end if;
  now_at:=clock_timestamp();
  if now_at<s.starts_at or now_at>=s.ends_at then return jsonb_build_object('marked',false); end if;
  select * into r from public.browserbase_shared_budget_reservations
    where reservation_id=p_id and project_id=p_project and period_id=p_period and status='pending'
      and nba_enabled is not null and (not nba_enabled or nba_day=(now_at at time zone 'UTC')::date)
      and created_at>=now_at-interval '30 seconds';
  if not found then return jsonb_build_object('marked',false); end if;
  deadline:=public.browserbase_shared_create_deadline(s.ends_at,r.nba_enabled,r.nba_day);
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
end $$;
