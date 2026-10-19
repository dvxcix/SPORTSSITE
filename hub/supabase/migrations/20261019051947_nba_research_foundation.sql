-- NBA-only durable facts and shared source cache. No existing flags or sports change.
create table public.nba_source_cache (
  key text primary key, payload jsonb, fetched_at timestamptz,
  expires_at timestamptz, lease_token uuid, lease_until timestamptz
);
create table public.nba_ingestion_state (
  key text primary key, endpoint text not null, season integer,
  cursor bigint, complete boolean not null default false,
  pages integer not null default 0, rows_seen bigint not null default 0,
  updated_at timestamptz, last_error text
);
create table public.nba_teams (id bigint primary key, payload jsonb not null, fetched_at timestamptz not null default now());
create table public.nba_players (id bigint primary key, team_id bigint, payload jsonb not null, fetched_at timestamptz not null default now());
create table public.nba_games (
  id bigint primary key, season integer not null, game_date date not null,
  home_team_id bigint not null, visitor_team_id bigint not null,
  postseason boolean not null default false, payload jsonb not null,
  fetched_at timestamptz not null default now()
);
create index nba_games_season_date on public.nba_games(season,game_date);
create table public.nba_player_game_stats (
  id bigint primary key, player_id bigint not null, game_id bigint not null,
  team_id bigint not null, season integer not null, game_date date not null,
  postseason boolean not null default false, position text,
  payload jsonb not null, fetched_at timestamptz not null default now(),
  unique(player_id,game_id)
);
create index nba_stats_player_date on public.nba_player_game_stats(player_id,game_date desc);
create index nba_stats_team_date on public.nba_player_game_stats(team_id,game_date desc);
create index nba_stats_season_date on public.nba_player_game_stats(season,game_date);
create table public.nba_advanced_game_stats (
  id bigint primary key, player_id bigint not null, game_id bigint not null,
  season integer not null, payload jsonb not null, fetched_at timestamptz not null default now(),
  unique(player_id,game_id)
);
create table public.nba_game_plays (
  game_id bigint not null, play_order integer not null, season integer not null,
  payload jsonb not null, fetched_at timestamptz not null default now(),
  primary key(game_id,play_order)
);
create or replace function public.claim_nba_source(p_key text,p_token uuid,p_seconds integer default 25)
returns boolean language plpgsql security invoker set search_path=public as $$
declare claimed text;
begin
  if length(p_key)>2048 or p_seconds<1 or p_seconds>600 then raise exception 'Invalid lease'; end if;
  insert into public.nba_source_cache(key,lease_token,lease_until)
  values(p_key,p_token,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until
  where nba_source_cache.lease_until is null or nba_source_cache.lease_until<now()
  returning key into claimed;
  return claimed is not null;
end $$;
create or replace function public.finish_nba_source(p_key text,p_token uuid,p_payload jsonb,p_ttl integer)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
  if p_ttl<1 or p_ttl>604800 then raise exception 'Invalid TTL'; end if;
  update public.nba_source_cache set payload=p_payload,fetched_at=now(),
    expires_at=now()+make_interval(secs=>p_ttl),lease_token=null,lease_until=null
  where key=p_key and lease_token=p_token;
  return found;
end $$;
do $$ declare t text; begin
  foreach t in array array['nba_source_cache','nba_ingestion_state','nba_teams','nba_players','nba_games','nba_player_game_stats','nba_advanced_game_stats','nba_game_plays'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to service_role',t);
  end loop;
end $$;
revoke all on function public.claim_nba_source(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.finish_nba_source(text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.claim_nba_source(text,uuid,integer) to service_role;
grant execute on function public.finish_nba_source(text,uuid,jsonb,integer) to service_role;
