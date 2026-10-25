begin;
do $$
declare game text; first jsonb; winner jsonb; kickoff timestamptz := clock_timestamp()+interval '10 minutes';
begin
  if has_table_privilege('anon','public.nfl_pregame_research','SELECT') or has_table_privilege('authenticated','public.nfl_pregame_research','SELECT')
    or has_table_privilege('service_role','public.nfl_pregame_research','INSERT') or has_table_privilege('service_role','public.nfl_pregame_research','UPDATE')
    or has_table_privilege('service_role','public.nfl_pregame_research','DELETE') then raise exception 'Research table privileges too broad'; end if;
  if has_function_privilege('anon','public.capture_nfl_pregame_research(text,text,integer,timestamptz,timestamptz,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.read_nfl_pregame_research(text,text,integer,timestamptz)','EXECUTE') then raise exception 'RPC privileges too broad'; end if;
  if not has_function_privilege('service_role','public.capture_nfl_pregame_research(text,text,integer,timestamptz,timestamptz,jsonb)','EXECUTE') then raise exception 'Service RPC unavailable'; end if;
  select game_id into game from public.nfl_schedule where gameday::date>current_date and gametime is not null order by gameday,game_id limit 1;
  if game is null then raise exception 'No future canonical NFL game for rollback check'; end if;
  first := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()-interval '2 minutes','{"status":"calculated","sentinel":1}'::jsonb);
  if first is null or first#>>'{payload,sentinel}' is distinct from '1' then raise exception 'Open capture missing'; end if;
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()-interval '3 minutes','{"status":"calculated","sentinel":0}'::jsonb);
  if winner is distinct from first then raise exception 'Older writer replaced winner'; end if;
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()-interval '1 minute','{"status":"awaiting-data","sentinel":2}'::jsonb);
  if winner is distinct from first then raise exception 'Incomplete writer replaced winner'; end if;
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,kickoff,'{"status":"calculated","sentinel":3}'::jsonb);
  if winner is distinct from first then raise exception 'Exact-start writer accepted'; end if;
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()+interval '1 minute','{"status":"calculated","sentinel":4}'::jsonb);
  if winner is distinct from first then raise exception 'Future observation accepted'; end if;
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()-interval '1 minute','{"status":"calculated","sentinel":5}'::jsonb);
  if winner#>>'{payload,sentinel}' is distinct from '5' then raise exception 'Newer open winner missing'; end if;
  -- Mimic a final archive clock already closed. The app has no direct UPDATE permission.
  update public.nfl_pregame_research set kickoff_at=clock_timestamp()-interval '30 seconds' where game_id=game and resource='board-lens:rollback-test';
  winner := public.capture_nfl_pregame_research(game,'board-lens:rollback-test',1,kickoff,clock_timestamp()-interval '45 seconds','{"status":"calculated","sentinel":6}'::jsonb);
  if winner#>>'{payload,sentinel}' is distinct from '5' then raise exception 'Closed archive overwritten'; end if;
  if public.capture_nfl_pregame_research(game,'slate-pool:rollback-test',1,kickoff,clock_timestamp()-interval '45 seconds','{"complete":true}'::jsonb) is not null then raise exception 'Different resource reopened closed game'; end if;
  if public.read_nfl_pregame_research(game,'board-lens:rollback-test',1,clock_timestamp()-interval '3 minutes') is not null then raise exception 'Earlier canonical cutoff not respected'; end if;
  if public.capture_nfl_pregame_research('not-a-canonical-game','test',1,kickoff,clock_timestamp(),'{}'::jsonb) is not null then raise exception 'Unknown canonical game accepted'; end if;
end $$;
rollback;
