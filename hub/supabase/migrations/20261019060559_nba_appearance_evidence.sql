-- Preserve brief recorded appearances; zero rounded minutes do not establish DNP.
create or replace function public.nba_stat_appeared(p jsonb)
returns boolean language sql immutable strict set search_path=public as $$
  select coalesce(public.nba_stat_minutes(p)>=0,false) and (
    public.nba_stat_minutes(p)>0 or exists(
      select 1 from unnest(array['pts','reb','ast','fg3m','stl','blk','turnover','fga','fgm','fg3a','fta','ftm']) field
      where case when jsonb_typeof(p->field)='number' then (p->>field)::numeric>0 else false end
    )
  )
$$;
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


create or replace function public.grade_nba_research_snapshots(p_limit integer default 2000)
returns integer language plpgsql security invoker set search_path=public as $$
declare updated integer;
begin
  if p_limit<1 or p_limit>10000 then raise exception 'Invalid NBA grade batch'; end if;
  with eligible as materialized (
    select r.id,public.nba_stat_market_value(s.payload,r.market) as actual
    from public.nba_research_snapshots r join public.nba_player_game_stats s on s.game_id=r.game_id and s.player_id=r.player_id
      join public.nba_games g on g.id=r.game_id and s.season=g.season and not s.postseason
    where r.status='pending' and (s.payload->'game'->>'status_state'='final' or s.payload->'game'->>'status'='Final')
      and public.nba_stat_appeared(s.payload) and public.nba_stat_market_value(s.payload,r.market) is not null
    order by r.id limit p_limit
  ) update public.nba_research_snapshots r set status='final',actual_value=e.actual,
    absolute_error=case when r.estimate is null then null else abs(r.estimate-e.actual) end,graded_at=now()
    from eligible e where e.id=r.id and r.status='pending';
  get diagnostics updated=row_count;return updated;
end $$;
revoke all on function public.nba_stat_appeared(jsonb) from public,anon,authenticated;
grant execute on function public.nba_stat_appeared(jsonb) to service_role;
