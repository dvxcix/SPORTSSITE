-- Add only the primary MLB public-count archive. No historical backfill or legacy writes.
do $$ begin
  if to_regclass('public.mlb_public_captures') is not null or to_regclass('public.mlb_public_capture_state') is not null then
    raise exception 'MLB public archive already exists; inspect before applying';
  end if;
end $$;

create table public.mlb_public_capture_state (
  game_id bigint primary key check (game_id > 0),
  game_date date not null,
  game_key text not null check (game_key ~ '^[A-Z0-9]{2,4}@[A-Z0-9]{2,4}(-G[1-9][0-9]?)?$'),
  starts_at timestamptz not null,
  observed_at timestamptz,
  fingerprint text,
  coverage jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  reserved_observed_at timestamptz,
  unique (game_date, game_key),
  unique (game_id, game_date, game_key),
  check ((observed_at is null) = (fingerprint is null)),
  check (fingerprint is null or fingerprint ~ '^[a-f0-9]{64}$'),
  check (observed_at is null or observed_at < starts_at)
);
create table public.mlb_public_captures (
  id bigint generated always as identity primary key,
  game_id bigint not null,
  game_date date not null,
  game_key text not null,
  starts_at timestamptz not null,
  captured_at timestamptz not null check (captured_at < starts_at),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) between 1 and 10000),
  foreign key (game_id,game_date,game_key) references public.mlb_public_capture_state(game_id,game_date,game_key),
  unique (game_id,captured_at)
);
create index mlb_public_captures_game_time on public.mlb_public_captures(game_id,game_date,game_key,captured_at desc,id desc);
create index mlb_public_state_date on public.mlb_public_capture_state(game_date,game_key);
alter table public.mlb_public_capture_state enable row level security;
alter table public.mlb_public_captures enable row level security;
revoke all on public.mlb_public_capture_state,public.mlb_public_captures from public,anon,authenticated,service_role;
grant select,insert,update on public.mlb_public_capture_state to service_role;
grant select,insert on public.mlb_public_captures to service_role;
revoke all on sequence public.mlb_public_captures_id_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.mlb_public_captures_id_seq to service_role;

create function public.begin_mlb_public_capture(p_game_id bigint,p_game_date date,p_game_key text,p_starts_at timestamptz,p_observed_at timestamptz,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare prior public.mlb_public_capture_state%rowtype; stamp timestamptz; cutoff timestamptz;
begin
  if p_game_id is null or p_game_id <= 0 or p_game_date is null or p_game_key is null
    or p_game_key !~ '^[A-Z0-9]{2,4}@[A-Z0-9]{2,4}(-G[1-9][0-9]?)?$'
    or p_starts_at is null or not isfinite(p_starts_at) or p_observed_at is null or not isfinite(p_observed_at) or p_token is null then
    raise exception 'Invalid MLB capture identity';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('mlb-public:'||p_game_id,0));
  stamp := clock_timestamp();
  select * into prior from public.mlb_public_capture_state where game_id=p_game_id;
  if found and (prior.game_date<>p_game_date or prior.game_key<>p_game_key) then raise exception 'MLB capture identity changed'; end if;
  cutoff := case when prior.starts_at<=stamp then prior.starts_at else p_starts_at end;
  if stamp>=cutoff or p_observed_at>=cutoff or p_observed_at>stamp+interval '1 minute' or p_observed_at<stamp-interval '10 minutes'
    or (prior.observed_at is not null and p_observed_at<=prior.observed_at) then raise exception 'MLB capture outside pregame observation window'; end if;
  if prior.lease_token is not null and prior.lease_until>stamp then return false; end if;
  -- A new earlier official start cannot retain an observation already after that start.
  if prior.observed_at>=cutoff then raise exception 'MLB capture cutoff conflicts with prior observation'; end if;
  insert into public.mlb_public_capture_state(game_id,game_date,game_key,starts_at,lease_token,lease_until,reserved_observed_at)
    values(p_game_id,p_game_date,p_game_key,cutoff,p_token,stamp+interval '120 seconds',p_observed_at)
    on conflict(game_id) do update set starts_at=excluded.starts_at,lease_token=excluded.lease_token,lease_until=excluded.lease_until,reserved_observed_at=excluded.reserved_observed_at;
  return true;
end $$;

create function public.finish_mlb_public_capture(p_game_id bigint,p_token uuid,p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare state public.mlb_public_capture_state%rowtype; stamp timestamptz; hash text; changed boolean; capture_coverage jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 10000
    or octet_length(p_rows::text)>2000000 then raise exception 'Invalid MLB capture rows'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r) is distinct from 'object'
    or jsonb_typeof(r->'playerName') is distinct from 'string' or length(btrim(r->>'playerName')) not between 1 and 120
    or jsonb_typeof(r->'market') is distinct from 'string' or (r->>'market') !~ '^[a-z0-9_]{1,80}$'
    or jsonb_typeof(r->'picks') is distinct from 'number' or (r->>'picks') !~ '^[0-9]{1,7}$'
    or (r->>'picks')::numeric>1000000)
    or (select count(*) from jsonb_array_elements(p_rows))<>(select count(distinct (r->>'playerName',r->>'market')) from jsonb_array_elements(p_rows) r)
    then raise exception 'Invalid or duplicate MLB capture row'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mlb-public:'||p_game_id,0));
  stamp := clock_timestamp();
  select * into state from public.mlb_public_capture_state where game_id=p_game_id;
  if not found or p_token is null or state.lease_token is distinct from p_token or state.lease_until<=stamp then raise exception 'MLB capture lease lost'; end if;
  if stamp>=state.starts_at or state.reserved_observed_at>=state.starts_at
    or state.reserved_observed_at<=state.observed_at then raise exception 'MLB capture observation no longer valid'; end if;
  hash := encode(sha256(convert_to(p_rows::text,'UTF8')),'hex');
  changed := state.fingerprint is distinct from hash;
  select jsonb_build_object('marketCount',count(distinct r->>'market'),'playerCount',count(distinct r->>'playerName'),'rowCount',count(*),
    'hasHomeRuns',bool_or(r->>'market'='home_runs'),
    'complete',bool_or(r->>'market'='home_runs') and count(distinct r->>'market')>=6 and count(distinct r->>'playerName')>=10 and count(*)>=15)
    into capture_coverage from jsonb_array_elements(p_rows) r;
  if changed then
    insert into public.mlb_public_captures(game_id,game_date,game_key,starts_at,captured_at,fingerprint,rows)
      values(state.game_id,state.game_date,state.game_key,state.starts_at,state.reserved_observed_at,hash,p_rows);
  end if;
  update public.mlb_public_capture_state set observed_at=state.reserved_observed_at,fingerprint=hash,coverage=capture_coverage,
    lease_token=null,lease_until=null,reserved_observed_at=null where game_id=p_game_id;
  return jsonb_build_object('changed',changed,'observedAt',state.reserved_observed_at,'rows',jsonb_array_length(p_rows));
end $$;

create function public.cancel_mlb_public_capture(p_game_id bigint,p_token uuid)
returns boolean language sql security invoker set search_path='' as $$
  with released as (update public.mlb_public_capture_state set lease_token=null,lease_until=null,reserved_observed_at=null
    where game_id=p_game_id and lease_token=p_token returning 1) select exists(select 1 from released);
$$;

create function public.read_mlb_public_captures(p_game_date date)
returns table(game_id bigint,game_key text,starts_at timestamptz,captured_at timestamptz,observed_at timestamptz,rows jsonb)
language sql stable security invoker set search_path='' as $$
  select s.game_id,s.game_key,s.starts_at,c.captured_at,s.observed_at,c.rows
  from public.mlb_public_capture_state s
  cross join lateral (
    select h.captured_at,h.rows from public.mlb_public_captures h
    where h.game_id=s.game_id and h.game_date=p_game_date and h.game_key=s.game_key
      and h.captured_at<s.starts_at and h.captured_at<=statement_timestamp()
    order by h.captured_at desc,h.id desc limit 2
  ) c
  where s.game_date=p_game_date and s.observed_at<s.starts_at
  order by s.game_id,c.captured_at desc;
$$;
revoke all on function public.begin_mlb_public_capture(bigint,date,text,timestamptz,timestamptz,uuid),public.finish_mlb_public_capture(bigint,uuid,jsonb),public.cancel_mlb_public_capture(bigint,uuid),public.read_mlb_public_captures(date) from public,anon,authenticated;
grant execute on function public.begin_mlb_public_capture(bigint,date,text,timestamptz,timestamptz,uuid),public.finish_mlb_public_capture(bigint,uuid,jsonb),public.cancel_mlb_public_capture(bigint,uuid),public.read_mlb_public_captures(date) to service_role;
