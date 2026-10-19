-- NBA-only descriptive research validation and prospective score ledger.
create table public.nba_model_reports (
  model_key text primary key, market text not null, validation_season integer not null,
  version text not null, report jsonb not null, created_at timestamptz not null default now()
);
create table public.nba_research_snapshots (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.nba_games(id), player_id bigint not null,
  team_id bigint not null, market text not null, version text not null,
  score integer not null check(score between 0 and 100), sample_games integer not null check(sample_games>=5),
  sample_through date not null, game_starts_at timestamptz not null,
  captured_at timestamptz not null default now(), fingerprint text not null,
  features jsonb not null, quote jsonb, estimate numeric, model_key text references public.nba_model_reports(model_key),
  status text not null default 'pending' check(status in ('pending','final','dnp')),
  actual_value numeric, absolute_error numeric, graded_at timestamptz,
  check(captured_at<game_starts_at),
  check(estimate is null or (model_key is not null and estimate between 0 and 1000)),
  check(market in ('points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists','steals','blocks','turnovers'))
);
create index nba_research_snapshot_lookup on public.nba_research_snapshots(game_id,player_id,market,version,captured_at desc,id desc);
create index nba_research_snapshot_pending on public.nba_research_snapshots(game_id) where status='pending';
create index nba_research_snapshot_model on public.nba_research_snapshots(model_key) where model_key is not null;
create index nba_stats_game_player on public.nba_player_game_stats(game_id,player_id);
create index nba_advanced_game_player on public.nba_advanced_game_stats(game_id,player_id);
create index nba_source_cache_expiry on public.nba_source_cache(expires_at) where expires_at is not null;
alter table public.nba_model_reports enable row level security;
alter table public.nba_research_snapshots enable row level security;
revoke all on public.nba_model_reports,public.nba_research_snapshots from public,anon,authenticated;
grant select,insert,update on public.nba_model_reports,public.nba_research_snapshots to service_role;
grant usage,select on sequence public.nba_research_snapshots_id_seq to service_role;

create or replace function public.nba_stat_minutes(p jsonb)
returns numeric language sql immutable strict set search_path=public as $$
  select case when p->>'min' ~ '^[0-9]+(\.[0-9]+|:[0-5][0-9])?$'
  then split_part(p->>'min',':',1)::numeric + case when position(':' in p->>'min')>0 then split_part(p->>'min',':',2)::numeric/60 else 0 end else null end
$$;
create or replace function public.nba_stat_market_value(p jsonb,p_market text)
returns numeric language plpgsql immutable strict set search_path=public as $$
declare fields text[]; field text; total numeric:=0;
begin
  fields:=case p_market when 'points' then array['pts'] when 'rebounds' then array['reb'] when 'assists' then array['ast'] when 'threes' then array['fg3m']
  when 'points_rebounds_assists' then array['pts','reb','ast'] when 'points_rebounds' then array['pts','reb'] when 'points_assists' then array['pts','ast'] when 'rebounds_assists' then array['reb','ast']
  when 'steals' then array['stl'] when 'blocks' then array['blk'] when 'turnovers' then array['turnover'] else null end;
  if fields is null then return null; end if;
  foreach field in array fields loop
    if jsonb_typeof(p->field) is distinct from 'number' then return null; end if;
    if (p->>field)::numeric<0 then return null; end if;
    total:=total+(p->>field)::numeric;
  end loop;
  return total;
end $$;

create or replace function public.fit_nba_production_baseline(p_market text,p_validation_season integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare output jsonb; v_model_key text; season_check integer;
begin
  if public.nba_stat_market_value('{"pts":0,"reb":0,"ast":0,"fg3m":0,"stl":0,"blk":0,"turnover":0}',p_market) is null or p_validation_season<2025 or p_validation_season>extract(year from now())::integer then raise exception 'Invalid NBA validation request'; end if;
  foreach season_check in array array[p_validation_season-2,p_validation_season-1,p_validation_season] loop
    if not exists(select 1 from public.nba_ingestion_state where key='stats:'||season_check and complete) then return jsonb_build_object('ready',false,'reason','Historical statistics are still importing'); end if;
  end loop;
  v_model_key:='nba-rolling-v1:'||p_market||':'||(p_validation_season-2)||'-'||(p_validation_season-1)||':'||p_validation_season;
  with valid as materialized (
    select player_id,game_id,season,game_date,public.nba_stat_market_value(payload,p_market)::double precision as value
    from public.nba_player_game_stats
    where season between p_validation_season-2 and p_validation_season and not postseason
      and (payload->'game'->>'status_state'='final' or payload->'game'->>'status'='Final')
      and public.nba_stat_minutes(payload)>0 and public.nba_stat_market_value(payload,p_market) is not null
  ), windows as (
    select *,avg(value) over w5 as recent,avg(value) over w15 as prior,avg(value) over w10 as baseline,count(*) over w20 as samples
    from valid window w5 as(partition by player_id order by game_date,game_id rows between 5 preceding and 1 preceding),
      w15 as(partition by player_id order by game_date,game_id rows between 20 preceding and 6 preceding),
      w10 as(partition by player_id order by game_date,game_id rows between 10 preceding and 1 preceding),
      w20 as(partition by player_id order by game_date,game_id rows between 20 preceding and 1 preceding)
  ), candidates as (
    select windows.*,candidate.weight,case when candidate.weight is null then baseline else recent*candidate.weight+prior*(1-candidate.weight) end as prediction
    from windows cross join unnest(array[null::double precision,0,.15,.35,.5,.65,.85,1]) as candidate(weight)
    where samples>=10 and recent is not null and prior is not null and baseline is not null
  ), training as (
    select weight,avg(abs(value-prediction)) as mae,count(*) as games,count(distinct player_id) as players,max(game_date) as through
    from candidates where season<p_validation_season group by weight
  ), selected as (
    select * from training order by mae,weight nulls first limit 1
  ), validation as (
    select avg(abs(value-prediction)) as mae,sqrt(avg(power(value-prediction,2))) as rmse,avg(prediction-value) as bias,
      avg(abs(value-baseline)) as baseline_mae,count(*) as games,count(distinct player_id) as players,min(game_date) as first_date,max(game_date) as last_date
    from candidates,selected where season=p_validation_season and candidates.weight is not distinct from selected.weight
  )
  select jsonb_build_object('ready',selected.games>=1000 and validation.games>=200,'version','nba-rolling-v1','market',p_market,
    'method',case when selected.weight is null then 'last10' else 'blend' end,'recentWeight',selected.weight,
    'trainingSeasons',jsonb_build_array(p_validation_season-2,p_validation_season-1),'trainingGames',selected.games,'trainingPlayers',selected.players,'trainingMae',selected.mae,'trainedThrough',selected.through,
    'validationSeason',p_validation_season,'validationGames',validation.games,'validationPlayers',validation.players,'validationMae',validation.mae,'validationRmse',validation.rmse,'validationBias',validation.bias,'baselineMae',validation.baseline_mae,
    'validationFrom',validation.first_date,'validationThrough',validation.last_date,'modelKey',v_model_key,
    'interpretation','Production forecast errors on a later held-out season; no historical odds, betting ROI or calibrated pick probabilities.') into output from selected cross join validation;
  if output is null then return jsonb_build_object('ready',false,'reason','Insufficient NBA observations'); end if;
  if (output->>'ready')::boolean then
    insert into public.nba_model_reports(model_key,market,validation_season,version,report) values(v_model_key,p_market,p_validation_season,'nba-rolling-v1',output)
    on conflict(model_key) do update set report=excluded.report,created_at=now();
  end if;
  return output;
end $$;

create or replace function public.record_nba_research_batch(p_rows jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare item jsonb; g public.nba_games%rowtype; starts timestamptz; previous text; inserted integer:=0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1500 then raise exception 'Invalid NBA research batch'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    select * into g from public.nba_games where id=(item->>'game_id')::bigint;
    if not found or g.postseason then raise exception 'NBA research game missing'; end if;
    starts:=(g.payload->>'datetime')::timestamptz;
    if starts is null or starts<=now() or g.payload->>'status_state' in ('final','in_progress') then raise exception 'NBA research must be captured before tipoff'; end if;
    if (item->>'team_id')::bigint not in(g.home_team_id,g.visitor_team_id) or not exists(select 1 from public.nba_players where id=(item->>'player_id')::bigint) then raise exception 'NBA research identity invalid'; end if;
    if (item->>'sample_through')::date>=g.game_date or (item->>'sample_through')::date>current_date or jsonb_typeof(item->'features') is distinct from 'object' or octet_length((item->'features')::text)>65536 or item->>'fingerprint' !~ '^[a-f0-9]{64}$' or length(item->>'version')>80 then raise exception 'NBA research sample invalid'; end if;
    if item->>'estimate' is not null and not exists(select 1 from public.nba_model_reports where model_key=item->>'model_key' and (report->>'trainedThrough')::date<g.game_date and (report->>'validationThrough')::date<g.game_date) then raise exception 'NBA research model chronology invalid'; end if;
    if item->'quote' is not null and item->'quote'<>'null'::jsonb and (item->'quote'->>'game_id' is distinct from item->>'game_id' or item->'quote'->>'player_id' is distinct from item->>'player_id' or item->'quote'->>'prop_type' is distinct from item->>'market') then raise exception 'NBA research quote identity invalid'; end if;
    perform pg_advisory_xact_lock(hashtextextended('nba-research:'||(item->>'game_id')||':'||(item->>'player_id')||':'||(item->>'market')||':'||(item->>'version'),0));
    select fingerprint into previous from public.nba_research_snapshots where game_id=(item->>'game_id')::bigint and player_id=(item->>'player_id')::bigint and market=item->>'market' and version=item->>'version' order by captured_at desc,id desc limit 1;
    if previous is not distinct from item->>'fingerprint' then continue; end if;
    insert into public.nba_research_snapshots(game_id,player_id,team_id,market,version,score,sample_games,sample_through,game_starts_at,fingerprint,features,quote,estimate,model_key)
    values((item->>'game_id')::bigint,(item->>'player_id')::bigint,(item->>'team_id')::bigint,item->>'market',item->>'version',(item->>'score')::integer,(item->>'sample_games')::integer,(item->>'sample_through')::date,starts,item->>'fingerprint',item->'features',nullif(item->'quote','null'::jsonb),(item->>'estimate')::numeric,item->>'model_key');
    inserted:=inserted+1;
  end loop;
  return inserted;
end $$;

create or replace function public.grade_nba_research_snapshots(p_limit integer default 2000)
returns integer language plpgsql security invoker set search_path=public as $$
declare updated integer;
begin
  if p_limit<1 or p_limit>10000 then raise exception 'Invalid NBA grade batch'; end if;
  with eligible as materialized (
    select r.id,public.nba_stat_minutes(s.payload) as minutes,public.nba_stat_market_value(s.payload,r.market) as actual
    from public.nba_research_snapshots r join public.nba_player_game_stats s on s.game_id=r.game_id and s.player_id=r.player_id
      join public.nba_games g on g.id=r.game_id and s.season=g.season and not s.postseason
    where r.status='pending' and (s.payload->'game'->>'status_state'='final' or s.payload->'game'->>'status'='Final')
      and public.nba_stat_minutes(s.payload) is not null
      and (public.nba_stat_minutes(s.payload)=0 or public.nba_stat_market_value(s.payload,r.market) is not null)
    order by r.id limit p_limit
  ) update public.nba_research_snapshots r set status=case when e.minutes=0 then 'dnp' else 'final' end,
    actual_value=case when e.minutes=0 then null else e.actual end,
    absolute_error=case when e.minutes=0 or r.estimate is null then null else abs(r.estimate-e.actual) end,graded_at=now()
    from eligible e where e.id=r.id and r.status='pending';
  get diagnostics updated=row_count; return updated;
end $$;

create or replace function public.prune_nba_source_cache(p_limit integer default 500)
returns integer language plpgsql security invoker set search_path=public as $$
declare removed integer;
begin
  if p_limit<1 or p_limit>2000 then raise exception 'Invalid NBA cache prune'; end if;
  with expired as(select key from public.nba_source_cache where expires_at<now()-interval '7 days' and (lease_until is null or lease_until<now()) order by expires_at limit p_limit)
    delete from public.nba_source_cache c using expired e where c.key=e.key;
  get diagnostics removed=row_count;return removed;
end $$;
grant delete on public.nba_source_cache to service_role;
revoke all on function public.nba_stat_minutes(jsonb),public.nba_stat_market_value(jsonb,text),public.fit_nba_production_baseline(text,integer),public.record_nba_research_batch(jsonb),public.grade_nba_research_snapshots(integer),public.prune_nba_source_cache(integer) from public,anon,authenticated;
grant execute on function public.nba_stat_minutes(jsonb),public.nba_stat_market_value(jsonb,text),public.fit_nba_production_baseline(text,integer),public.record_nba_research_batch(jsonb),public.grade_nba_research_snapshots(integer),public.prune_nba_source_cache(integer) to service_role;
