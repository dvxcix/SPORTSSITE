create or replace function public.refresh_nfl_production(p_season integer)
returns jsonb language plpgsql security invoker set search_path = '' as $fn$
declare affected integer; covered integer; expected integer; missing jsonb;
begin
  if p_season < 2026 or p_season > extract(year from now())::integer then
    raise exception 'Production repair is scoped to 2026 and later current seasons';
  end if;
  -- Serialize this season's rebuild without blocking other seasons.
  perform pg_advisory_xact_lock(260921, p_season);
  with complete_games as (
    select p.game_id from public.nfl_pbp p join public.nfl_schedule s using(game_id)
    where p.season=p_season and p.season_type='REG' and s.away_score is not null and s.home_score is not null
    group by p.game_id having max(p.qtr)>=4 and min(p.game_seconds_remaining)=0
  ), plays as materialized (
    select p.* from public.nfl_pbp p join complete_games c using(game_id)
    where p.season=p_season and p.season_type='REG'
      and not coalesce(p.play_deleted,false) and p.play_type is distinct from 'no_play'
      and not coalesce(p.two_point_attempt,false)
  ), team as (
    select game_id,posteam,
      count(*) filter(where pass_attempt and receiver_player_id is not null and not coalesce(sack,false)) targets,
      sum(air_yards) filter(where pass_attempt and receiver_player_id is not null) air,
      count(*) filter(where pass_attempt and receiver_player_id is not null and air_yards is null) missing_air,
      count(*) filter(where pass_attempt and receiver_player_id is not null and yardline_100>0 and yardline_100<=20) rz_targets,
      count(*) filter(where rush_attempt and rusher_player_id is not null and yardline_100>0 and yardline_100<=20) rz_carries
    from plays group by game_id,posteam
  ), participants as (
    select p.*,v.id,v.name,v.role from plays p cross join lateral (values
      (case when p.pass_attempt or p.sack then p.passer_player_id end,p.passer_player_name,'pass'),
      (case when p.rush_attempt then p.rusher_player_id end,p.rusher_player_name,'rush'),
      (case when p.pass_attempt then p.receiver_player_id end,p.receiver_player_name,'rec'),
      (case when p.complete_pass then nullif(p.raw->>'lateral_receiver_player_id','') end,p.raw->>'lateral_receiver_player_name','lateral_rec')
    ) v(id,name,role) where v.id is not null
  ), a as (
    select id,season,week,season_type,game_id,posteam,defteam,max(name) short_name,max(updated_at) source_updated_at,
      count(*) filter(where role='pass' and complete_pass) as completions,
      count(*) filter(where role='pass' and pass_attempt and not coalesce(sack,false)) as attempts,
      coalesce(sum(passing_yards) filter(where role='pass' and complete_pass),0) as passing_yards,
      count(*) filter(where role='pass' and pass_touchdown) as passing_tds,
      count(*) filter(where role='pass' and interception) as interceptions,
      count(*) filter(where role='pass' and sack) as sacks,
      -coalesce(sum(yards_gained) filter(where role='pass' and sack),0) as sack_yards,
      case when count(*) filter(where role='pass' and pass_attempt and receiver_player_id is not null)=count(air_yards) filter(where role='pass' and pass_attempt and receiver_player_id is not null) then coalesce(sum(air_yards) filter(where role='pass' and pass_attempt and receiver_player_id is not null),0) end as passing_air_yards,
      sum(yards_after_catch) filter(where role='pass' and complete_pass) as passing_yards_after_catch,
      count(*) filter(where role='pass' and first_down_pass) as passing_first_downs,
      sum(epa) filter(where role='pass' and pass_attempt) as passing_epa,
      count(*) filter(where role='rush' and rush_attempt) as carries,
      coalesce(sum(rushing_yards) filter(where role='rush' and rush_attempt),0) as rushing_yards,
      count(*) filter(where role='rush' and rush_touchdown and coalesce(nullif(raw->>'td_player_id',''),rusher_player_id)=id) as rushing_tds,
      count(*) filter(where role='rush' and first_down_rush) as rushing_first_downs,
      sum(epa) filter(where role='rush' and rush_attempt) as rushing_epa,
      count(*) filter(where role='rec' and complete_pass) as receptions,
      count(*) filter(where role='rec' and pass_attempt and not coalesce(sack,false)) as targets,
      coalesce(sum(case when role='lateral_rec' then nullif(raw->>'lateral_receiving_yards','')::numeric else receiving_yards end) filter(where role in ('rec','lateral_rec') and complete_pass),0) as receiving_yards,
      count(*) filter(where role in ('rec','lateral_rec') and pass_touchdown and coalesce(nullif(raw->>'td_player_id',''),receiver_player_id)=id) as receiving_tds,
      case when count(*) filter(where role='rec' and pass_attempt)=count(air_yards) filter(where role='rec' and pass_attempt) then coalesce(sum(air_yards) filter(where role='rec' and pass_attempt),0) end as receiving_air_yards,
      sum(yards_after_catch) filter(where role='rec' and complete_pass) as receiving_yards_after_catch,
      count(*) filter(where role='rec' and first_down_pass) as receiving_first_downs,
      sum(epa) filter(where role='rec' and pass_attempt) as receiving_epa,
      count(*) filter(where role='rec' and pass_attempt and yardline_100>0 and yardline_100<=20) as red_zone_targets,
      count(*) filter(where role='rush' and rush_attempt and yardline_100>0 and yardline_100<=20) as red_zone_carries
    from participants group by id,season,week,season_type,game_id,posteam,defteam
  ), resolved as (
    select a.*, b.display_name,b.position,b.position_group,b.headshot,
      a.targets::numeric/nullif(t.targets,0) as target_share,
      case when t.missing_air=0 then a.receiving_air_yards/nullif(t.air,0) end as air_yards_share,
      a.red_zone_targets::numeric/nullif(t.rz_targets,0) as red_zone_target_share,
      a.red_zone_carries::numeric/nullif(t.rz_carries,0) as red_zone_carry_share
    from a join team t on t.game_id=a.game_id and t.posteam=a.posteam
    left join public.nfl_players b on b.gsis_id=a.id
  )
  insert into public.nfl_player_stats as old (
    player_id,season,week,season_type,game_id,player_name,player_display_name,position,position_group,headshot_url,recent_team,opponent_team,
    completions,attempts,passing_yards,passing_tds,interceptions,sacks,sack_yards,passing_air_yards,passing_yards_after_catch,passing_first_downs,passing_epa,carries,rushing_yards,rushing_tds,rushing_first_downs,rushing_epa,receptions,targets,receiving_yards,receiving_tds,receiving_air_yards,receiving_yards_after_catch,receiving_first_downs,receiving_epa,red_zone_targets,red_zone_carries, target_share,air_yards_share,red_zone_target_share,red_zone_carry_share,data_source,source_updated_at,updated_at
  ) select id,season,week,season_type,game_id,short_name,coalesce(display_name,short_name),position,position_group,headshot,posteam,defteam,
    completions,attempts,passing_yards,passing_tds,interceptions,sacks,sack_yards,passing_air_yards,passing_yards_after_catch,passing_first_downs,passing_epa,carries,rushing_yards,rushing_tds,rushing_first_downs,rushing_epa,receptions,targets,receiving_yards,receiving_tds,receiving_air_yards,receiving_yards_after_catch,receiving_first_downs,receiving_epa,red_zone_targets,red_zone_carries,target_share,air_yards_share,red_zone_target_share,red_zone_carry_share,'pbp',source_updated_at,now()
    from resolved
  on conflict(player_id,season,week,season_type) do update set
    game_id=case when old.data_source='pbp' then excluded.game_id else old.game_id end,
    player_name=case when old.data_source='pbp' then excluded.player_name else old.player_name end,
    player_display_name=case when old.data_source='pbp' then excluded.player_display_name else old.player_display_name end,
    position=case when old.data_source='pbp' then excluded.position else old.position end,
    position_group=case when old.data_source='pbp' then excluded.position_group else old.position_group end,
    headshot_url=case when old.data_source='pbp' then excluded.headshot_url else old.headshot_url end,
    recent_team=case when old.data_source='pbp' then excluded.recent_team else old.recent_team end,
    opponent_team=case when old.data_source='pbp' then excluded.opponent_team else old.opponent_team end,
    completions=case when old.data_source='pbp' then excluded.completions else old.completions end,
    attempts=case when old.data_source='pbp' then excluded.attempts else old.attempts end,
    passing_yards=case when old.data_source='pbp' then excluded.passing_yards else old.passing_yards end,
    passing_tds=case when old.data_source='pbp' then excluded.passing_tds else old.passing_tds end,
    interceptions=case when old.data_source='pbp' then excluded.interceptions else old.interceptions end,
    sacks=case when old.data_source='pbp' then excluded.sacks else old.sacks end,
    sack_yards=case when old.data_source='pbp' then excluded.sack_yards else old.sack_yards end,
    passing_air_yards=case when old.data_source='pbp' then excluded.passing_air_yards else old.passing_air_yards end,
    passing_yards_after_catch=case when old.data_source='pbp' then excluded.passing_yards_after_catch else old.passing_yards_after_catch end,
    passing_first_downs=case when old.data_source='pbp' then excluded.passing_first_downs else old.passing_first_downs end,
    passing_epa=case when old.data_source='pbp' then excluded.passing_epa else old.passing_epa end,
    carries=case when old.data_source='pbp' then excluded.carries else old.carries end,
    rushing_yards=case when old.data_source='pbp' then excluded.rushing_yards else old.rushing_yards end,
    rushing_tds=case when old.data_source='pbp' then excluded.rushing_tds else old.rushing_tds end,
    rushing_first_downs=case when old.data_source='pbp' then excluded.rushing_first_downs else old.rushing_first_downs end,
    rushing_epa=case when old.data_source='pbp' then excluded.rushing_epa else old.rushing_epa end,
    receptions=case when old.data_source='pbp' then excluded.receptions else old.receptions end,
    targets=case when old.data_source='pbp' then excluded.targets else old.targets end,
    receiving_yards=case when old.data_source='pbp' then excluded.receiving_yards else old.receiving_yards end,
    receiving_tds=case when old.data_source='pbp' then excluded.receiving_tds else old.receiving_tds end,
    receiving_air_yards=case when old.data_source='pbp' then excluded.receiving_air_yards else old.receiving_air_yards end,
    receiving_yards_after_catch=case when old.data_source='pbp' then excluded.receiving_yards_after_catch else old.receiving_yards_after_catch end,
    receiving_first_downs=case when old.data_source='pbp' then excluded.receiving_first_downs else old.receiving_first_downs end,
    receiving_epa=case when old.data_source='pbp' then excluded.receiving_epa else old.receiving_epa end,
    red_zone_targets=excluded.red_zone_targets,
    red_zone_carries=excluded.red_zone_carries,
    target_share=case when old.data_source='pbp' then excluded.target_share else old.target_share end,
    air_yards_share=case when old.data_source='pbp' then excluded.air_yards_share else old.air_yards_share end,
    red_zone_target_share=excluded.red_zone_target_share,
    red_zone_carry_share=excluded.red_zone_carry_share,
    data_source=case when old.data_source='pbp' then excluded.data_source else old.data_source end,
    source_updated_at=excluded.source_updated_at,
    updated_at=excluded.updated_at
;
  get diagnostics affected=row_count;
  select count(*) into covered from (select game_id from public.nfl_pbp where season=p_season and season_type='REG' group by game_id having max(qtr)>=4 and min(game_seconds_remaining)=0) c;
  select count(*) into expected from public.nfl_schedule where season=p_season and game_type='REG' and away_score is not null and home_score is not null;
  select coalesce(jsonb_agg(s.game_id),'[]'::jsonb) into missing from public.nfl_schedule s
    where s.season=p_season and s.game_type='REG' and s.away_score is not null and s.home_score is not null
      and not exists(select 1 from public.nfl_pbp p where p.game_id=s.game_id group by p.game_id having max(p.qtr)>=4 and min(p.game_seconds_remaining)=0);
  return jsonb_build_object('season',p_season,'rows',affected,'coveredGames',covered,'completedGames',expected,'missingGames',missing);
end $fn$;
revoke all on function public.refresh_nfl_production(integer) from public,anon,authenticated;
grant execute on function public.refresh_nfl_production(integer) to service_role;
comment on function public.refresh_nfl_production(integer) is 'Rebuild completed current-season weekly production from retained plays. Provider box scores are preserved while PBP-derived RZ fields are refreshed; excludes nullified plays and conversions; service-role only.';
