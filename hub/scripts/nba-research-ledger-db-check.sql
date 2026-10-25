-- Run only after the narrow cutoff migration. All fixture changes roll back.
begin;
set local statement_timeout='10s';
do $fixtures$
declare player bigint; origin timestamptz:=clock_timestamp();
begin
  if exists(select 1 from public.nba_games where id between 999990010 and 999990012)
    or exists(select 1 from public.nba_pregame_research where game_id between 999990010 and 999990012) then raise exception 'Ledger fixture IDs already exist'; end if;
  select id into player from public.nba_players order by id limit 1;
  if player is null then raise exception 'No valid player for ledger fixture'; end if;
  perform set_config('test.nba_player',player::text,true);
  insert into public.nba_games(id,season,game_date,home_team_id,visitor_team_id,postseason,payload)
    select id,2026,current_date,1,2,false,jsonb_build_object('datetime',origin+interval '5 minutes','status_state','scheduled','status','Scheduled','period',0)
    from generate_series(999990010,999990012) id;
  -- Existing canonical close is in the past despite the later provider time.
  insert into public.nba_pregame_research(game_id,resource,version,tipoff_at,observed_at,source,payload)
    values(999990011,'board:v1',1,origin-interval '1 second',origin-interval '2 seconds','capture','{}');
  if has_function_privilege('anon','public.record_nba_research_batch(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.record_nba_research_batch(jsonb)','EXECUTE') then raise exception 'Public ledger writer'; end if;
end $fixtures$;
set local role service_role;
do $test$
declare item jsonb; n integer; before_call timestamptz; saved timestamptz;
begin
  item:=jsonb_build_object('game_id',999990010,'player_id',current_setting('test.nba_player')::bigint,'team_id',1,'market','points','version','cutoff-fixture','score',50,'sample_games',5,'sample_through',current_date-1,'features','{}'::jsonb,'fingerprint',repeat('a',64));
  perform pg_sleep(0.03);
  before_call:=clock_timestamp();
  n:=public.record_nba_research_batch(jsonb_build_array(item));
  if n<>1 then raise exception 'Healthy pretip observation not inserted'; end if;
  select captured_at into saved from public.nba_research_snapshots where game_id=999990010 and version='cutoff-fixture';
  if saved<before_call then raise exception 'Ledger backdated to transaction-start time'; end if;
  if public.record_nba_research_batch(jsonb_build_array(item))<>0 then raise exception 'Unchanged fingerprint duplicated'; end if;
  begin
    perform public.record_nba_research_batch(jsonb_build_array(item||'{"game_id":999990011}'::jsonb));
    raise exception 'Later provider schedule reopened canonical close';
  exception when raise_exception then
    if SQLERRM<>'NBA research must be captured before tipoff' then raise; end if;
  end;
end $test$;
reset role;
-- The transaction began before this tip. Wall clock will be after it when the
-- writer is called, proving the old now()-based guard is insufficient.
update public.nba_games set payload=jsonb_set(payload,'{datetime}',to_jsonb(clock_timestamp()+interval '60 milliseconds')) where id=999990012;
select pg_sleep(0.09);
set local role service_role;
do $test$
begin
  begin
    perform public.record_nba_research_batch(jsonb_build_array(jsonb_build_object('game_id',999990012,'player_id',current_setting('test.nba_player')::bigint,'team_id',1,'market','points','version','cutoff-fixture','score',50,'sample_games',5,'sample_through',current_date-1,'features','{}'::jsonb,'fingerprint',repeat('b',64))));
    raise exception 'Transaction-start clock reopened elapsed tip';
  exception when raise_exception then
    if SQLERRM<>'NBA research must be captured before tipoff' then raise; end if;
  end;
end $test$;
reset role;
select 'passed' as ledger_cutoff_and_capture_time, count(*) as temporary_valid_rows from public.nba_research_snapshots where game_id between 999990010 and 999990012;
rollback;
