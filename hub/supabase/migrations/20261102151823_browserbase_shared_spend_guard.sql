-- Shared NBA/NFL spending guard. Baseline provisioning is a separate,
-- explicitly reviewed operation; this migration never initializes a baseline
-- or performs automatic rollover.
set lock_timeout='2s';
set statement_timeout='10s';
do $$ declare f regprocedure := to_regprocedure('public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text,bigint[])'); begin
  if f is null or md5(pg_get_functiondef(f)) <> 'ad77f9d78021ee432413281b59d366bf' then raise exception 'NBA budget function changed; inspect before release'; end if;
  if to_regclass('public.browserbase_shared_budget_state') is not null or to_regclass('public.browserbase_shared_budget_reservations') is not null then raise exception 'Shared budget state already exists'; end if;
end $$;
-- The guard is not a guaranteed provider invoice cap. Configure a verified
-- account/project baseline only with explicit authority and live preflight.
-- Actual provider billing has no proven per-session byte ceiling, and a
-- delayed observation cannot limit in-flight proxy bytes. No automatic reset.
create table public.browserbase_shared_budget_state (
  project_id text primary key,
  period_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  baseline_bytes bigint not null check (baseline_bytes >= 0),
  baseline_minutes numeric not null check (baseline_minutes >= 0),
  last_bytes bigint not null check (last_bytes >= baseline_bytes),
  last_minutes numeric not null check (last_minutes >= baseline_minutes),
  last_observed_at timestamptz not null,
  reserved_cents bigint not null default 0 check (reserved_cents >= 0),
  -- The owner's shared additional-spend limit is $100. Provider lag and an
  -- unbounded in-flight session mean this is not a guaranteed invoice cap.
  ceiling_cents integer not null check (ceiling_cents between 1 and 10000)
);
create table public.browserbase_shared_budget_reservations (
  reservation_id uuid primary key,
  project_id text not null references public.browserbase_shared_budget_state(project_id),
  period_id uuid not null,
  reserved_cents integer not null,
  timeout_seconds integer not null check(timeout_seconds between 60 and 450),
  nba_enabled boolean,
  nba_day date,
  nba_daily_sessions integer,
  nba_period_sessions integer,
  nba_daily_minutes integer,
  nba_period_minutes integer,
  nba_reset_day integer,
  nba_daily_cents integer,
  nba_period_cents integer,
  nba_workflow text,
  nba_game_ids bigint[],
  created_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending' check(status in ('pending','creating','active','closing','closed')),
  creating_at timestamptz,
  remote_session_id text,
  heartbeat_at timestamptz,
  closed_at timestamptz,
  check ((status='pending' and creating_at is null and remote_session_id is null and heartbeat_at is null and closed_at is null)
    or (status='creating' and creating_at is not null and remote_session_id is null and heartbeat_at is null and closed_at is null)
    or (status in ('active','closing') and creating_at is not null and remote_session_id is not null and heartbeat_at is not null and closed_at is null)
    or (status='closed' and closed_at is not null))
);
alter table public.browserbase_shared_budget_state enable row level security;
alter table public.browserbase_shared_budget_reservations enable row level security;
revoke all on public.browserbase_shared_budget_state,public.browserbase_shared_budget_reservations from public,anon,authenticated,service_role;

-- The provisioned row supplies the exact owner-authorized baseline and verified
-- period. An unavailable row never creates one and can never reset the budget.
create function public.apply_browserbase_shared_budget(
  p_project text, p_period uuid, p_id uuid, p_timeout_seconds integer,
  p_minutes numeric, p_bytes bigint, p_observed_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare
  s public.browserbase_shared_budget_state%rowtype;
  now_at timestamptz;
  cost bigint;
  debit integer;
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
  if p_id is null then
    return jsonb_build_object('allowed',cost+s.reserved_cents<=s.ceiling_cents,'reason','checked','floorCents',cost+s.reserved_cents);
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
  if cost+s.reserved_cents+debit>s.ceiling_cents then return jsonb_build_object('allowed',false,'reason','spend-limit'); end if;
  update public.browserbase_shared_budget_state set reserved_cents=reserved_cents+debit where project_id=p_project;
  insert into public.browserbase_shared_budget_reservations(reservation_id,project_id,period_id,reserved_cents,timeout_seconds)
    values(p_id,p_project,p_period,debit,p_timeout_seconds);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'reservedCents',debit,'floorCents',cost+s.reserved_cents+debit);
end $$;
revoke all on function public.apply_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz) from public,anon,authenticated,service_role;
-- Only the reviewed SECURITY DEFINER wrapper owner can call this helper.

-- Lock the global project first, then the existing NBA ledger. The migration
-- creates no provider sessions or baseline rows.
create function public.reserve_browserbase_shared_budget(
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
revoke all on function public.reserve_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[]) from public,anon,authenticated,service_role;
grant execute on function public.reserve_browserbase_shared_budget(text,uuid,uuid,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[]) to service_role;

-- Monitoring does not make reservations. A false/unknown result must release
-- the already-running remote session; it is not a pre-create admission error.
create function public.check_browserbase_shared_budget(
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
  global_result:=public.apply_browserbase_shared_budget(p_project,p_period,null,null,p_minutes,p_bytes,p_observed_at);
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
revoke all on function public.check_browserbase_shared_budget(text,uuid,uuid,text,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[]) from public,anon,authenticated,service_role;
grant execute on function public.check_browserbase_shared_budget(text,uuid,uuid,text,integer,numeric,bigint,timestamptz,boolean,integer,integer,integer,integer,integer,integer,integer,text,bigint[]) to service_role;

-- Must succeed before any SDK create POST. A response timeout is uncertain:
-- do not issue the POST and do not retry; creating remains blocked.
-- Conservative no-launch cutoff: one minute before the verified period end,
-- and for NBA also one minute before the admitted UTC day ends. No buffer can
-- guarantee when a remote provider actually accepts a request.
create function public.browserbase_shared_create_deadline(p_ends_at timestamptz,p_nba boolean,p_nba_day date)
returns timestamptz language sql immutable set search_path='' as $$
  select case when p_ends_at is null or p_nba is null or (p_nba and p_nba_day is null) then null
    when p_nba then least(p_ends_at - interval '60 seconds', ((p_nba_day+1)::timestamp at time zone 'UTC') - interval '60 seconds')
    else p_ends_at - interval '60 seconds' end
$$;
revoke all on function public.browserbase_shared_create_deadline(timestamptz,boolean,date) from public,anon,authenticated,service_role;

create function public.mark_browserbase_shared_creating(p_project text,p_period uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare s public.browserbase_shared_budget_state%rowtype; r public.browserbase_shared_budget_reservations%rowtype; now_at timestamptz; deadline timestamptz;
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
  if deadline is null or now_at>=deadline then return jsonb_build_object('marked',false); end if;
  update public.browserbase_shared_budget_reservations set status='creating',creating_at=now_at
    where reservation_id=p_id and project_id=p_project and period_id=p_period and status='pending';
  if not found then return jsonb_build_object('marked',false); end if;
  return jsonb_build_object('marked',true,'notAfter',deadline);
end $$;

-- Must be called before the SDK release request, then resolved only after the
-- provider confirms that exact session has stopped. Failure never clears it.
create function public.mark_browserbase_shared_closing(p_project text,p_period uuid,p_id uuid,p_session_id text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
begin
  perform 1 from public.browserbase_shared_budget_state where project_id=p_project and period_id=p_period for update;
  if not found then return false; end if;
  if p_session_id is null or p_session_id !~ '^[A-Za-z0-9_-]{1,128}$' then return false; end if;
  update public.browserbase_shared_budget_reservations
    set status='closing',remote_session_id=p_session_id,heartbeat_at=coalesce(heartbeat_at,clock_timestamp())
    where reservation_id=p_id and project_id=p_project and period_id=p_period
      and (status='creating' or (status='active' and remote_session_id=p_session_id));
  return found;
end $$;
create function public.resolve_browserbase_shared_session(p_project text,p_period uuid,p_id uuid,p_session_id text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
begin
  perform 1 from public.browserbase_shared_budget_state where project_id=p_project and period_id=p_period for update;
  if not found then return false; end if;
  update public.browserbase_shared_budget_reservations set status='closed',closed_at=clock_timestamp()
    where reservation_id=p_id and project_id=p_project and period_id=p_period and remote_session_id=p_session_id and status='closing';
  return found;
end $$;
-- This must be called only when code can prove no session-create POST was
-- attempted. It safely races a delayed creating transition under the same
-- project lock. Never call it for a rejected, timed-out or uncertain POST.
create function public.abandon_browserbase_shared_before_create(p_project text,p_period uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
begin
  perform 1 from public.browserbase_shared_budget_state where project_id=p_project and period_id=p_period for update;
  if not found then return false; end if;
  update public.browserbase_shared_budget_reservations set status='closed',closed_at=clock_timestamp()
    where reservation_id=p_id and project_id=p_project and period_id=p_period and status in ('pending','creating');
  return found;
end $$;
revoke all on function public.mark_browserbase_shared_creating(text,uuid,uuid), public.mark_browserbase_shared_closing(text,uuid,uuid,text), public.resolve_browserbase_shared_session(text,uuid,uuid,text), public.abandon_browserbase_shared_before_create(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mark_browserbase_shared_creating(text,uuid,uuid), public.mark_browserbase_shared_closing(text,uuid,uuid,text), public.resolve_browserbase_shared_session(text,uuid,uuid,text), public.abandon_browserbase_shared_before_create(text,uuid,uuid) to service_role;

-- Force new callers through the combined admission/check wrapper.
revoke all on function public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text,bigint[]) from public,anon,authenticated,service_role;

-- Revise the existing NBA function only after its original hash preflight.
-- No historical counter, reservation, timestamp, or price is changed.
do $allowance$
declare f regprocedure := 'public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text,bigint[])'::regprocedure;
  original text; changed text; before text; after text;
begin
  original:=pg_get_functiondef(f);
  if md5(original)<>'ad77f9d78021ee432413281b59d366bf' then raise exception 'NBA budget changed; review before applying allowance'; end if;
  -- The verified live definition uses LF. Normalize patch operands so a CRLF
  -- checkout or transport cannot prevent exact, hash-guarded anchor matches.
  before:=$find$  v_daily_minutes integer:=p_daily_minutes;
begin$find$;
  after:=$replace$  v_daily_minutes integer:=p_daily_minutes;
  v_nov2_approved boolean:=false;
begin$replace$;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA declaration anchor not found'; end if;
  before:=$find$  select * into v_day_spend from public.nba_browser_spend_windows where project_id=p_project_id and kind='day' and starts_on=v_day;$find$;
  after:=$replace$  -- Owner-authorized total daily ceiling for this exact date and project.
  -- The first five existing reservations and all prior floor remain charged.
  -- Stop one minute before midnight Berlin; ordinary $3/$50 resumes after.
  if p_project_id='648484cb-1b8f-468d-a88d-8a0555da458a'
    and v_day='2026-11-02'::date and v_now<'2026-11-02T22:59:00Z'::timestamptz then
    v_daily_cents:=500; v_daily_sessions:=8; v_daily_minutes:=40; v_nov2_approved:=true;
  end if;
  select * into v_day_spend from public.nba_browser_spend_windows where project_id=p_project_id and kind='day' and starts_on=v_day;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA allowance placement anchor not found'; end if;
  before:=$find$    || case when v_allowance.allowance_key is not null then jsonb_build_object('allowanceKey',v_allowance.allowance_key,
      'allowanceExpiresAt',to_char(v_allowance.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else '{}'::jsonb end;$find$;
  after:=$replace$    || case when v_allowance.allowance_key is not null then jsonb_build_object('allowanceKey',v_allowance.allowance_key,
      'allowanceExpiresAt',to_char(v_allowance.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) else '{}'::jsonb end
    || case when v_nov2_approved then jsonb_build_object('allowanceKey','nba-one-day-2026-11-02',
      'allowanceExpiresAt','2026-11-02T22:59:00.000Z') else '{}'::jsonb end;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA allowance receipt anchor not found'; end if;
  -- Provider totals may not yet include a previous browser while unrelated
  -- traffic has already appeared. Preserve each prior floor and add every
  -- reservation in the window to the observed delta. Double counting is
  -- deliberate; no usage or uncertain attempt is refunded.
  before:=$find$    v_day_floor:=greatest(v_day_spend.cost_floor_cents,v_day_actual);$find$;
  after:=$replace$    select greatest(v_day_spend.cost_floor_cents,v_day_actual+coalesce(sum(reserved_cents),0))
      into v_day_floor from public.nba_browser_budget_reservations where project_id=p_project_id and day=v_day;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA daily exposure anchor not found'; end if;
  before:=$find$    v_period_floor:=greatest(v_period_spend.cost_floor_cents,v_period_actual);$find$;
  after:=$replace$    select greatest(v_period_spend.cost_floor_cents,v_period_actual+coalesce(sum(reserved_cents),0))
      into v_period_floor from public.nba_browser_budget_reservations where project_id=p_project_id and period_start=v_period;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA period exposure anchor not found'; end if;
  -- Permit the exact reserved ceiling while a session is active, but stop it
  -- if the conservative observed-plus-reserved amount exceeds the ceiling.
  before:=$find$  if v_day_actual>=v_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;$find$;
  after:=$replace$  if v_day_actual>=v_daily_cents or v_day_floor>v_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA daily monitoring anchor not found'; end if;
  before:=$find$  if v_period_actual>=p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;$find$;
  after:=$replace$  if v_period_actual>=p_period_cents or v_period_floor>p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA period monitoring anchor not found'; end if;
  -- NBA retains its immutable usage records and bounded counters, but the
  -- owner removed sport-specific dollar caps. The shared wrapper above is the
  -- only service-role launch/check path and owns the one monetary limit.
  before:=$find$  if v_day_actual>=v_daily_cents or v_day_floor>v_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;$find$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),'');
  if changed=original then raise exception 'NBA daily dollar monitor anchor not found'; end if;
  before:=$find$  if v_period_actual>=p_period_cents or v_period_floor>p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;$find$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),'');
  if changed=original then raise exception 'NBA period dollar monitor anchor not found'; end if;
  before:=$find$  if v_day_floor+v_reserved_cents>v_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;$find$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),'');
  if changed=original then raise exception 'NBA daily dollar reservation anchor not found'; end if;
  before:=$find$  if v_period_floor+v_reserved_cents>p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;$find$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),'');
  if changed=original then raise exception 'NBA period dollar reservation anchor not found'; end if;
  before:=$find$    v_day_floor+v_reserved_cents+51>v_daily_cents or v_period_floor+v_reserved_cents+51>p_period_cents
    or coalesce(v_daily.sessions,0)+2>v_daily_sessions$find$;
  after:=$replace$    coalesce(v_daily.sessions,0)+2>v_daily_sessions$replace$;
  original:=changed;
  changed:=replace(original,replace(before,chr(13),''),replace(after,chr(13),''));
  if changed=original then raise exception 'NBA protected-share dollar anchor not found'; end if;
  execute changed;
end $allowance$;
