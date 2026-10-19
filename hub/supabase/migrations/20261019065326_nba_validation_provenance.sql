-- Report actual source years/dates, including partially available quarter history.
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
    select player_id,game_id,season,game_date,postseason,payload,research from public.nba_player_game_stats where not quarter
    union all select player_id,game_id,season,game_date,postseason,payload,research from public.nba_player_period_stats where quarter and period=1
  ), valid as materialized (
    select player_id,game_id,season,game_date,(case when temporal_split then game_date>=make_date(p_validation_season+1,1,1) else season=p_validation_season end) as is_validation,(research->>p_market)::double precision as value
    from source
    where season between p_validation_season-2 and p_validation_season and not postseason
      and (payload->'game'->>'status_state'='final' or payload->'game'->>'status'='Final')
      and research->>'appeared'='true' and jsonb_typeof(research->p_market)='number'
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
    select weight,avg(abs(value-prediction)) as mae,avg(power(value-prediction,2)) as mse,count(*) as games,count(distinct player_id) as players,min(game_date) as from_date,max(game_date) as through
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
    'trainingSeasons',(select jsonb_agg(s.season order by s.season) from(select distinct season from valid where not is_validation)s),'trainingFrom',selected.from_date,'sourceCoverage',(select jsonb_agg(s order by s.season) from(select season,count(*) as appearances,count(distinct game_id) as games,min(game_date) as first_date,max(game_date) as last_date from valid group by season)s),'split',case when temporal_split then 'Within-season chronological holdout from January 1; earlier quarter seasons unavailable' else 'Later season holdout' end,'criterion',case when binary_event then 'brier' else 'mae' end,'validationBrier',case when binary_event then power(validation.rmse,2) else null end,'baselineBrier',case when binary_event then validation.baseline_brier else null end,'trainingGames',selected.games,'trainingPlayers',selected.players,'trainingMae',selected.mae,'trainedThrough',selected.through,
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
