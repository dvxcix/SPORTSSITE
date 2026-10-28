-- Additive, service-only, permanent debits. No cache/pruning dependency and no refunds.
set lock_timeout = '2s';
set statement_timeout = '10s';
do $$ begin
  if to_regclass('public.nba_browser_budget_projects') is not null
    or to_regclass('public.nba_browser_budget_counters') is not null
    or to_regclass('public.nba_browser_budget_reservations') is not null
    or to_regprocedure('public.reserve_nba_browser_budget(uuid,text,integer,integer,integer,integer,integer,integer)') is not null then
    raise exception 'NBA browser budget ledger already exists; review before applying';
  end if;
end $$;

create table public.nba_browser_budget_projects (
  project_id text primary key check (project_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  reset_day smallint not null check (reset_day between 1 and 28),
  created_at timestamptz not null default clock_timestamp()
);
create table public.nba_browser_budget_counters (
  project_id text not null references public.nba_browser_budget_projects(project_id),
  kind text not null check (kind in ('day','period')),
  starts_on date not null,
  sessions integer not null default 0 check (sessions >= 0),
  reserved_minutes integer not null default 0 check (reserved_minutes >= 0),
  primary key (project_id,kind,starts_on)
);
create table public.nba_browser_budget_reservations (
  id uuid primary key,
  project_id text not null references public.nba_browser_budget_projects(project_id),
  day date not null,
  period_start date not null check (period_start <= day),
  timeout_seconds smallint not null check (timeout_seconds between 60 and 300),
  reserved_minutes smallint not null check (reserved_minutes = (timeout_seconds + 59) / 60),
  created_at timestamptz not null default clock_timestamp()
);
create index nba_browser_budget_reservations_project_time on public.nba_browser_budget_reservations(project_id,created_at desc);
alter table public.nba_browser_budget_projects enable row level security;
alter table public.nba_browser_budget_counters enable row level security;
alter table public.nba_browser_budget_reservations enable row level security;
revoke all on public.nba_browser_budget_projects, public.nba_browser_budget_counters, public.nba_browser_budget_reservations from public,anon,authenticated,service_role;
grant select,insert on public.nba_browser_budget_reservations to service_role;
-- UPDATE on projects is required by SELECT FOR UPDATE in this invoker RPC.
grant select,insert,update on public.nba_browser_budget_projects, public.nba_browser_budget_counters to service_role;

create function public.reserve_nba_browser_budget(
  p_id uuid,p_project_id text,p_timeout_seconds integer,p_daily_sessions integer,p_period_sessions integer,
  p_daily_minutes integer,p_period_minutes integer,p_reset_day integer
) returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '2s' set statement_timeout = '5s' as $$
declare
  v_day date;
  v_period date;
  v_reset integer;
  v_minutes integer;
  v_daily public.nba_browser_budget_counters%rowtype;
  v_monthly public.nba_browser_budget_counters%rowtype;
begin
  if p_id is null or p_project_id is null or p_project_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or p_timeout_seconds is null or p_timeout_seconds not between 60 and 300
    or p_daily_sessions is null or p_daily_sessions not between 1 and 1000
    or p_period_sessions is null or p_period_sessions not between 1 and 10000
    or p_daily_minutes is null or p_daily_minutes not between 1 and 30000
    or p_period_minutes is null or p_period_minutes not between 1 and 30000
    or p_reset_day is null or p_reset_day not between 1 and 28 then
    raise exception 'Invalid NBA browser budget reservation';
  end if;
  insert into public.nba_browser_budget_projects(project_id,reset_day) values(p_project_id,p_reset_day) on conflict do nothing;
  -- One project row serializes BOTH quota windows, including their first insert.
  select reset_day into strict v_reset from public.nba_browser_budget_projects where project_id=p_project_id for update;
  if v_reset <> p_reset_day then return jsonb_build_object('allowed',false,'reason','period-configuration'); end if;
  if exists(select 1 from public.nba_browser_budget_reservations where id=p_id) then
    return jsonb_build_object('allowed',false,'reason','duplicate');
  end if;
  -- Compute after the lock from the database clock; clients cannot choose a new
  -- quota day or shift a period to bypass earlier uncertain reservations.
  v_day := (clock_timestamp() at time zone 'UTC')::date;
  v_period := make_date(extract(year from v_day)::integer,extract(month from v_day)::integer,v_reset);
  if v_period > v_day then v_period := (v_period - interval '1 month')::date; end if;
  v_minutes := (p_timeout_seconds+59)/60;
  insert into public.nba_browser_budget_counters(project_id,kind,starts_on)
    values(p_project_id,'day',v_day),(p_project_id,'period',v_period) on conflict do nothing;
  select * into strict v_daily from public.nba_browser_budget_counters where project_id=p_project_id and kind='day' and starts_on=v_day;
  select * into strict v_monthly from public.nba_browser_budget_counters where project_id=p_project_id and kind='period' and starts_on=v_period;
  if v_daily.sessions >= p_daily_sessions then return jsonb_build_object('allowed',false,'reason','daily-session-limit'); end if;
  if v_monthly.sessions >= p_period_sessions then return jsonb_build_object('allowed',false,'reason','period-session-limit'); end if;
  if v_daily.reserved_minutes+v_minutes > p_daily_minutes then return jsonb_build_object('allowed',false,'reason','daily-minute-limit'); end if;
  if v_monthly.reserved_minutes+v_minutes > p_period_minutes then return jsonb_build_object('allowed',false,'reason','period-minute-limit'); end if;
  insert into public.nba_browser_budget_reservations(id,project_id,day,period_start,timeout_seconds,reserved_minutes)
    values(p_id,p_project_id,v_day,v_period,p_timeout_seconds,v_minutes);
  update public.nba_browser_budget_counters set sessions=sessions+1,reserved_minutes=reserved_minutes+v_minutes
    where project_id=p_project_id and ((kind='day' and starts_on=v_day) or (kind='period' and starts_on=v_period));
  return jsonb_build_object('allowed',true,'reason','reserved','id',p_id,'day',v_day,'periodStart',v_period,'reservedMinutes',v_minutes);
end $$;
revoke all on function public.reserve_nba_browser_budget(uuid,text,integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.reserve_nba_browser_budget(uuid,text,integer,integer,integer,integer,integer,integer) to service_role;
comment on table public.nba_browser_budget_reservations is 'Permanent NBA browser-create debits, including uncertain creates. Never prune with source caches; no automatic refund.';
comment on function public.reserve_nba_browser_budget(uuid,text,integer,integer,integer,integer,integer,integer) is 'Service-only atomic per-project UTC day and configured monthly-period launch/runtime admission; does not cap provider proxy bytes.';
