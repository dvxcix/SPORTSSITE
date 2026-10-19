-- Explicit period provenance and binary event outcomes. No full-game proxy for Q1.
create or replace function public.nba_stat_market_value(p jsonb,p_market text)
returns numeric language plpgsql immutable strict set search_path=public as $$
declare fields text[]; field text; total numeric:=0; successes integer:=0; unknowns integer:=0; required integer;
begin
 if p_market in('double_double','triple_double') then
  if coalesce((p->>'period')::integer,0)<>0 then return null; end if;
  required:=case when p_market='double_double' then 2 else 3 end;
  foreach field in array array['pts','reb','ast','stl','blk'] loop
   if jsonb_typeof(p->field) is distinct from 'number' or (p->>field)::numeric<0 then unknowns:=unknowns+1;
   elsif (p->>field)::numeric>=10 then successes:=successes+1; end if;
  end loop;
  return case when successes>=required then 1 when successes+unknowns>=required then null else 0 end;
 end if;
 if right(p_market,3)='_1q' then if p->>'period' is distinct from '1' then return null; end if;
 elsif coalesce((p->>'period')::integer,0)<>0 then return null; end if;
 fields:=case p_market when 'points' then array['pts'] when 'points_1q' then array['pts'] when 'rebounds' then array['reb'] when 'rebounds_1q' then array['reb'] when 'assists' then array['ast'] when 'assists_1q' then array['ast'] when 'threes' then array['fg3m'] when 'points_rebounds_assists' then array['pts','reb','ast'] when 'points_rebounds' then array['pts','reb'] when 'points_assists' then array['pts','ast'] when 'rebounds_assists' then array['reb','ast'] when 'steals' then array['stl'] when 'blocks' then array['blk'] when 'turnovers' then array['turnover'] else null end;
 if fields is null then return null; end if;
 foreach field in array fields loop
  if jsonb_typeof(p->field) is distinct from 'number' or (p->>field)::numeric<0 then return null; end if; total:=total+(p->>field)::numeric;
 end loop; return total;
end $$;

alter table public.nba_research_snapshots drop constraint nba_research_snapshots_market_check;
alter table public.nba_research_snapshots add constraint nba_research_snapshots_market_check check(market in('points','rebounds','assists','threes','points_rebounds_assists','points_rebounds','points_assists','rebounds_assists','steals','blocks','turnovers','double_double','triple_double','points_1q','rebounds_1q','assists_1q'));
create or replace function public.fit_nba_production_baseline(p_market text,p_validation_season integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare output jsonb; v_model_key text; season_check integer; quarter boolean:=right(p_market,3)='_1q'; binary_event boolean:=p_market in('double_double','triple_double'); temporal_split boolean:=false;
begin
  if public.nba_stat_market_value('{"pts":0,"reb":0,"ast":0,"fg3m":0,"stl":0,"blk":0,"turnover":0}'::jsonb || jsonb_build_object('period',case when quarter then 1 else 0 end),p_market) is null or p_validation_season<2025 or p_validation_season>extract(year from now())::integer then raise exception 'Invalid NBA validation request'; end if;
  foreach season_check in array array[p_validation_season-2,p_validation_season-1,p_validation_season] loop
    if not exists(select 1 from public.nba_ingestion_state where key=(case when quarter then 'period1:' else 'stats:' end)||season_check and complete) then return jsonb_build_object('ready',false,'reason','Historical statistics are still importing'); end if;
  end loop;
  if quarter then select not exists(select 1 from public.nba_player_period_stats where season<p_validation_season and period=1) into temporal_split; end if;
  v_model_key:='nba-rolling-v1:'||p_market||':'||(p_validation_season-2)||'-'||(p_validation_season-1)||':'||p_validation_season;
  with source as (
    select player_id,game_id,season,game_date,postseason,payload from public.nba_player_game_stats where not quarter
    union all select player_id,game_id,season,game_date,postseason,payload from public.nba_player_period_stats where quarter and period=1
  ), valid as materialized (
    select player_id,game_id,season,game_date,(case when temporal_split then game_date>=make_date(p_validation_season+1,1,1) else season=p_validation_season end) as is_validation,public.nba_stat_market_value(payload,p_market)::double precision as value
    from source
    where season between p_validation_season-2 and p_validation_season and not postseason
      and (payload->'game'->>'status_state'='final' or payload->'game'->>'status'='Final')
      and public.nba_stat_appeared(payload) and public.nba_stat_market_value(payload,p_market) is not null
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
    select weight,avg(abs(value-prediction)) as mae,avg(power(value-prediction,2)) as mse,count(*) as games,count(distinct player_id) as players,max(game_date) as through
    from candidates where not is_validation group by weight
  ), selected as (
    select * from training order by case when binary_event then mse else mae end,weight nulls first limit 1
  ), validation as (
    select avg(abs(value-prediction)) as mae,sqrt(avg(power(value-prediction,2))) as rmse,avg(prediction-value) as bias,
      avg(abs(value-baseline)) as baseline_mae,avg(power(value-baseline,2)) as baseline_brier,count(*) as games,count(distinct player_id) as players,min(game_date) as first_date,max(game_date) as last_date
    from candidates,selected where is_validation and candidates.weight is not distinct from selected.weight
  )
  select jsonb_build_object('ready',selected.games>=1000 and validation.games>=200,'version','nba-rolling-v1','market',p_market,
    'method',case when selected.weight is null then 'last10' else 'blend' end,'recentWeight',selected.weight,
    'trainingSeasons',case when temporal_split then jsonb_build_array(p_validation_season) else jsonb_build_array(p_validation_season-2,p_validation_season-1) end,'split',case when temporal_split then 'Within-season chronological holdout from January 1; earlier quarter seasons unavailable' else 'Later season holdout' end,'criterion',case when binary_event then 'brier' else 'mae' end,'validationBrier',case when binary_event then power(validation.rmse,2) else null end,'baselineBrier',case when binary_event then validation.baseline_brier else null end,'trainingGames',selected.games,'trainingPlayers',selected.players,'trainingMae',selected.mae,'trainedThrough',selected.through,
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
create or replace function public.grade_nba_research_snapshots(p_limit integer default 2000)
returns integer language plpgsql security invoker set search_path=public as $$
declare updated integer;
begin
  if p_limit<1 or p_limit>10000 then raise exception 'Invalid NBA grade batch'; end if;
  with eligible as materialized (
    select r.id,public.nba_stat_market_value(s.payload,r.market) as actual
    from public.nba_research_snapshots r join (select game_id,player_id,season,postseason,payload,0 as period from public.nba_player_game_stats union all select game_id,player_id,season,postseason,payload,period from public.nba_player_period_stats) s on s.game_id=r.game_id and s.player_id=r.player_id and s.period=case when right(r.market,3)='_1q' then 1 else 0 end
      join public.nba_games g on g.id=r.game_id and s.season=g.season and not s.postseason
    where r.status='pending' and (s.payload->'game'->>'status_state'='final' or s.payload->'game'->>'status'='Final')
      and public.nba_stat_appeared(s.payload) and public.nba_stat_market_value(s.payload,r.market) is not null
    order by r.id limit p_limit
  ) update public.nba_research_snapshots r set status='final',actual_value=e.actual,
    absolute_error=case when r.estimate is null then null else abs(r.estimate-e.actual) end,graded_at=now()
    from eligible e where e.id=r.id and r.status='pending';
  get diagnostics updated=row_count;return updated;
end $$;
