-- Additional spend only: anchor on the first admitted NBA browser in each UTC
-- window. Provider aggregate usage includes other sports conservatively.
-- A monotonic monetary floor prevents refunds after uncertain creates or lag.
set lock_timeout='2s';
set statement_timeout='10s';
do $$ begin
  if to_regclass('public.nba_browser_budget_projects') is null
    or to_regclass('public.nba_browser_spend_state') is not null
    or to_regclass('public.nba_browser_spend_windows') is not null
    or to_regprocedure('public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamp with time zone,integer,integer,text)') is not null then
    raise exception 'NBA spend budget prerequisites changed; review before applying';
  end if;
  if exists(select 1 from public.nba_browser_budget_reservations limit 1) then
    raise exception 'Existing NBA reservations need reviewed monetary accounting';
  end if;
end $$;

create table public.nba_browser_spend_state (
  project_id text primary key references public.nba_browser_budget_projects(project_id),
  browser_minutes numeric not null check (browser_minutes between 0 and 1000000000),
  proxy_bytes bigint not null check (proxy_bytes between 0 and 1000000000000000),
  observed_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.nba_browser_spend_windows (
  project_id text not null references public.nba_browser_budget_projects(project_id),
  kind text not null check (kind in ('day','period')),
  starts_on date not null,
  baseline_browser_minutes numeric not null check (baseline_browser_minutes between 0 and 1000000000),
  baseline_proxy_bytes bigint not null check (baseline_proxy_bytes between 0 and 1000000000000000),
  baseline_observed_at timestamptz not null,
  cost_floor_cents bigint not null check (cost_floor_cents>=0),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(project_id,kind,starts_on)
);
alter table public.nba_browser_budget_reservations add column reserved_cents smallint not null check(reserved_cents between 1 and 51);
alter table public.nba_browser_budget_reservations add column usage_observed_at timestamptz not null;
alter table public.nba_browser_budget_reservations add column workflow text not null check(workflow in ('public','direct'));
create index nba_browser_budget_reservations_workflow_day on public.nba_browser_budget_reservations(project_id,day,workflow);
alter table public.nba_browser_spend_state enable row level security;
alter table public.nba_browser_spend_windows enable row level security;
revoke all on public.nba_browser_spend_state,public.nba_browser_spend_windows from public,anon,authenticated,service_role;
grant select,insert,update on public.nba_browser_spend_state,public.nba_browser_spend_windows to service_role;

create function public.apply_nba_browser_spend_budget(
  p_id uuid,p_project_id text,p_timeout_seconds integer,p_daily_sessions integer,p_period_sessions integer,
  p_daily_minutes integer,p_period_minutes integer,p_reset_day integer,
  p_browser_minutes numeric,p_proxy_bytes bigint,p_observed_at timestamptz,p_daily_cents integer,p_period_cents integer,p_workflow text
) returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='2s' set statement_timeout='5s' as $$
declare
  v_now timestamptz;
  v_day date; v_period date; v_reset integer;
  v_minutes integer; v_reserved_cents integer;
  v_state public.nba_browser_spend_state%rowtype;
  v_day_spend public.nba_browser_spend_windows%rowtype;
  v_period_spend public.nba_browser_spend_windows%rowtype;
  v_daily public.nba_browser_budget_counters%rowtype;
  v_monthly public.nba_browser_budget_counters%rowtype;
  v_day_exists boolean; v_period_exists boolean;
  v_day_actual bigint:=0; v_period_actual bigint:=0;
  v_day_floor bigint:=0; v_period_floor bigint:=0;
  v_protect_public boolean;
begin
  if p_project_id is null or p_project_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_workflow is null or p_workflow not in ('public','direct')
    or p_daily_sessions is null or p_daily_sessions not between 1 and 1000
    or p_period_sessions is null or p_period_sessions not between 1 and 10000
    or p_daily_minutes is null or p_daily_minutes not between 1 and 30000
    or p_period_minutes is null or p_period_minutes not between 1 and 30000
    or p_reset_day is null or p_reset_day not between 1 and 28
    or p_daily_cents is null or p_daily_cents not between 1 and 300
    or p_period_cents is null or p_period_cents not between 1 and 5000
    or p_browser_minutes is null or p_browser_minutes not between 0 and 1000000000
    or p_proxy_bytes is null or p_proxy_bytes not between 0 and 1000000000000000
    or p_observed_at is null or not isfinite(p_observed_at)
    or (p_id is not null and (p_timeout_seconds is null or p_timeout_seconds not between 60 and 300))
    or (p_id is null and p_timeout_seconds is not null) then
    raise exception 'Invalid NBA browser spend budget request';
  end if;
  if p_id is not null then
    insert into public.nba_browser_budget_projects(project_id,reset_day) values(p_project_id,p_reset_day) on conflict do nothing;
  end if;
  select reset_day into v_reset from public.nba_browser_budget_projects where project_id=p_project_id for update;
  if not found then return jsonb_build_object('allowed',false,'reason','budget-uninitialized'); end if;
  if v_reset<>p_reset_day then return jsonb_build_object('allowed',false,'reason','period-configuration'); end if;
  v_now:=clock_timestamp();
  -- Read-start timestamp from a fresh, bounded provider call. Reject any future
  -- clock and anything more than 30 seconds old after waiting for the lock.
  if p_observed_at>v_now or p_observed_at<v_now-interval '30 seconds' then
    return jsonb_build_object('allowed',false,'reason','usage-stale');
  end if;
  select * into v_state from public.nba_browser_spend_state where project_id=p_project_id;
  if found then
    if p_observed_at<v_state.observed_at then return jsonb_build_object('allowed',false,'reason','usage-reordered'); end if;
    if p_browser_minutes<v_state.browser_minutes or p_proxy_bytes<v_state.proxy_bytes then
      -- Usage has no provider period identifier. A reset/decrease requires
      -- explicit review; never silently interpret it as new spending room.
      return jsonb_build_object('allowed',false,'reason','usage-decreased');
    end if;
  end if;
  v_day:=(v_now at time zone 'UTC')::date;
  v_period:=make_date(extract(year from v_day)::integer,extract(month from v_day)::integer,v_reset);
  if v_period>v_day then v_period:=(v_period-interval '1 month')::date; end if;
  select * into v_day_spend from public.nba_browser_spend_windows where project_id=p_project_id and kind='day' and starts_on=v_day;
  v_day_exists:=found;
  select * into v_period_spend from public.nba_browser_spend_windows where project_id=p_project_id and kind='period' and starts_on=v_period;
  v_period_exists:=found;
  if p_id is null and (not v_day_exists or not v_period_exists) then
    return jsonb_build_object('allowed',false,'reason','budget-uninitialized');
  end if;
  -- Published Startup overage rates: $10/decimal GB and $0.10/browser hour.
  -- One cent per MB, plus one cent per six browser minutes. Round upward.
  if v_day_exists then
    v_day_actual:=ceil((p_proxy_bytes-v_day_spend.baseline_proxy_bytes)::numeric/1000000
      +(p_browser_minutes-v_day_spend.baseline_browser_minutes)/6)::bigint;
    v_day_floor:=greatest(v_day_spend.cost_floor_cents,v_day_actual);
  end if;
  if v_period_exists then
    v_period_actual:=ceil((p_proxy_bytes-v_period_spend.baseline_proxy_bytes)::numeric/1000000
      +(p_browser_minutes-v_period_spend.baseline_browser_minutes)/6)::bigint;
    v_period_floor:=greatest(v_period_spend.cost_floor_cents,v_period_actual);
  end if;
  insert into public.nba_browser_spend_state(project_id,browser_minutes,proxy_bytes,observed_at,updated_at)
    values(p_project_id,p_browser_minutes,p_proxy_bytes,p_observed_at,v_now)
    on conflict(project_id) do update set browser_minutes=excluded.browser_minutes,proxy_bytes=excluded.proxy_bytes,
      observed_at=excluded.observed_at,updated_at=excluded.updated_at;
  update public.nba_browser_spend_windows set cost_floor_cents=case kind when 'day' then v_day_floor else v_period_floor end,updated_at=v_now
    where project_id=p_project_id and ((kind='day' and starts_on=v_day) or (kind='period' and starts_on=v_period));
  if v_day_actual>=p_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;
  if v_period_actual>=p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;
  if p_id is null then
    -- Existing sessions may use their reservation; a reserved floor at the cap
    -- alone is not an instruction to stop before actual usage reaches the cap.
    return jsonb_build_object('allowed',true,'reason','checked','day',v_day,'periodStart',v_period,
      'dailyActualCents',v_day_actual,'periodActualCents',v_period_actual,'dailyFloorCents',v_day_floor,'periodFloorCents',v_period_floor);
  end if;
  if exists(select 1 from public.nba_browser_budget_reservations where id=p_id) then
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  v_minutes:=(p_timeout_seconds+59)/60;
  -- Reserve 50 MB plus the entire rounded-up runtime. No success refund.
  v_reserved_cents:=ceil(50+v_minutes::numeric/6)::integer;
  if v_day_floor+v_reserved_cents>p_daily_cents then return jsonb_build_object('allowed',false,'reason','daily-spend-limit'); end if;
  if v_period_floor+v_reserved_cents>p_period_cents then return jsonb_build_object('allowed',false,'reason','period-spend-limit'); end if;
  select * into v_daily from public.nba_browser_budget_counters where project_id=p_project_id and kind='day' and starts_on=v_day;
  select * into v_monthly from public.nba_browser_budget_counters where project_id=p_project_id and kind='period' and starts_on=v_period;
  if coalesce(v_daily.sessions,0)>=p_daily_sessions then return jsonb_build_object('allowed',false,'reason','daily-session-limit'); end if;
  if coalesce(v_monthly.sessions,0)>=p_period_sessions then return jsonb_build_object('allowed',false,'reason','period-session-limit'); end if;
  if coalesce(v_daily.reserved_minutes,0)+v_minutes>p_daily_minutes then return jsonb_build_object('allowed',false,'reason','daily-minute-limit'); end if;
  if coalesce(v_monthly.reserved_minutes,0)+v_minutes>p_period_minutes then return jsonb_build_object('allowed',false,'reason','period-minute-limit'); end if;

  -- Direct prices cannot consume the public workflow's first daily attempt.
  -- Hold one maximum session in BOTH windows without charging that unused slot.
  -- An actual public reservation (including an uncertain create) releases it.
  v_protect_public:=p_workflow='direct' and not exists(
    select 1 from public.nba_browser_budget_reservations where project_id=p_project_id and day=v_day and workflow='public'
  );
  if v_protect_public and (
    v_day_floor+v_reserved_cents+51>p_daily_cents or v_period_floor+v_reserved_cents+51>p_period_cents
    or coalesce(v_daily.sessions,0)+2>p_daily_sessions or coalesce(v_monthly.sessions,0)+2>p_period_sessions
    or coalesce(v_daily.reserved_minutes,0)+v_minutes+5>p_daily_minutes
    or coalesce(v_monthly.reserved_minutes,0)+v_minutes+5>p_period_minutes
  ) then return jsonb_build_object('allowed',false,'reason','public-share-reserved'); end if;

  -- Only an approved admission creates a new actual-usage baseline.
  insert into public.nba_browser_spend_windows(project_id,kind,starts_on,baseline_browser_minutes,baseline_proxy_bytes,baseline_observed_at,cost_floor_cents,updated_at)
    values(p_project_id,'day',v_day,p_browser_minutes,p_proxy_bytes,p_observed_at,v_day_floor+v_reserved_cents,v_now),
      (p_project_id,'period',v_period,p_browser_minutes,p_proxy_bytes,p_observed_at,v_period_floor+v_reserved_cents,v_now)
    on conflict(project_id,kind,starts_on) do update set cost_floor_cents=excluded.cost_floor_cents,updated_at=excluded.updated_at;
  insert into public.nba_browser_budget_counters(project_id,kind,starts_on,sessions,reserved_minutes)
    values(p_project_id,'day',v_day,1,v_minutes),(p_project_id,'period',v_period,1,v_minutes)
    on conflict(project_id,kind,starts_on) do update set sessions=nba_browser_budget_counters.sessions+1,
      reserved_minutes=nba_browser_budget_counters.reserved_minutes+excluded.reserved_minutes;
  insert into public.nba_browser_budget_reservations(id,project_id,day,period_start,timeout_seconds,reserved_minutes,reserved_cents,usage_observed_at,workflow)
    values(p_id,p_project_id,v_day,v_period,p_timeout_seconds,v_minutes,v_reserved_cents,p_observed_at,p_workflow);
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'day',v_day,'periodStart',v_period,
    'reservedMinutes',v_minutes,'reservedCents',v_reserved_cents);
end $$;
-- Old callers cannot bypass the newly approved monetary limits.
revoke all on function public.reserve_nba_browser_budget(uuid,text,integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text) to service_role;
comment on table public.nba_browser_spend_windows is 'Additional NBA browser spending: actual project delta and monotonic reservation floor, never refunds. Proxy estimates are not an exact invoice guarantee.';
comment on function public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text) is 'Service-only atomic additional-spend admission or active usage check. NULL ID checks only. Direct admission protects the first public attempt daily; usage reset/decrease fails closed.';
