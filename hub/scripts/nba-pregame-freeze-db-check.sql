begin;
set local statement_timeout='10s';
do $check$
begin
  if exists(select 1 from public.nba_pregame_research where game_id in(999990001,999990002,999990003,999990004)) then raise exception 'Fixture IDs already exist'; end if;
  if has_table_privilege('anon','public.nba_pregame_research','SELECT') or has_table_privilege('authenticated','public.nba_pregame_research','SELECT') then raise exception 'Archive is public'; end if;
  if has_table_privilege('service_role','public.nba_pregame_research','INSERT') or has_table_privilege('service_role','public.nba_pregame_research','UPDATE') or has_table_privilege('service_role','public.nba_pregame_research','DELETE') then raise exception 'Application can bypass capture guard'; end if;
  if has_function_privilege('anon','public.read_nba_pregame_research(bigint,text,integer,timestamptz)','EXECUTE') or has_function_privilege('authenticated','public.read_nba_pregame_research(bigint,text,integer,timestamptz)','EXECUTE') then raise exception 'Public archive reader'; end if;
  if has_function_privilege('authenticated','public.capture_nba_pregame_research(bigint,text,integer,timestamptz,timestamptz,jsonb)','EXECUTE') then raise exception 'Public writer'; end if;
end $check$;
set local role service_role;
do $test$
declare
  origin timestamptz:=clock_timestamp();
  tip timestamptz:=origin+interval '5 minutes';
  r jsonb; cutoff timestamptz;
begin
  r:=public.capture_nba_pregame_research(999990001,'board:v1',1,tip,origin-interval '3 seconds','{"statsComplete":true,"periodStatsComplete":true,"issues":[],"marker":1}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'First capture rejected'; end if;
  r:=public.capture_nba_pregame_research(999990001,'board:v1',1,tip,origin-interval '4 seconds','{"statsComplete":true,"periodStatsComplete":true,"issues":[],"marker":2}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Older writer replaced winner'; end if;
  r:=public.capture_nba_pregame_research(999990001,'board:v1',1,tip,origin-interval '2 seconds','{"statsComplete":true,"periodStatsComplete":false,"issues":[],"marker":2}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Partial Q1 replaced complete'; end if;
  r:=public.capture_nba_pregame_research(999990001,'board:v1',1,tip,origin-interval '2 seconds','{"statsComplete":true,"periodStatsComplete":true,"issues":["Season averages unavailable"],"marker":2}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Missing baseline replaced complete'; end if;
  r:=public.capture_nba_pregame_research(999990001,'board:v1',1,tip,origin-interval '1 second','{"statsComplete":true,"periodStatsComplete":true,"issues":[],"marker":3}');
  if r#>>'{payload,marker}' is distinct from '3' then raise exception 'Newer complete capture rejected'; end if;
  r:=public.capture_nba_pregame_research(999990002,'board:v1',1,clock_timestamp()+interval '150 milliseconds',origin,'{"marker":1}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Boundary first capture rejected'; end if;
  r:=public.read_nba_pregame_research(999990001,'board:v1',1,tip);
  if r#>>'{payload,marker}' is distinct from '3' then raise exception 'Locked read lost winning capture'; end if;
  r:=public.read_nba_pregame_research(999990002,'board:v1',1,tip);
  cutoff:=(r->>'tipoff_at')::timestamptz;
  perform pg_sleep(0.2);
  r:=public.capture_nba_pregame_research(999990002,'board:v1',1,tip,origin+interval '1 millisecond','{"marker":99}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Closed game changed'; end if;
  r:=public.capture_nba_pregame_research(999990002,'scouting:v1',1,tip,origin,'{"marker":99}');
  if r is not null then raise exception 'New resource reopened closed game'; end if;
  r:=public.read_nba_pregame_research(999990002,'board:v1',1,tip);
  if r#>>'{payload,marker}' is distinct from '1' or (r->>'tipoff_at')::timestamptz is distinct from cutoff then raise exception 'Locked read reopened closed game'; end if;
  if public.nba_phase_cutoff(999990002,tip) is distinct from cutoff then raise exception 'Canonical research cutoff lost'; end if;
  r:=public.capture_nba_pregame_research(999990003,'board:v1',1,tip,tip,'{"marker":1}');
  if r is not null then raise exception 'Exact-tip observation accepted'; end if;
  r:=public.capture_nba_pregame_research(999990003,'board:v1',1,tip,clock_timestamp()+interval '1 minute','{"marker":1}');
  if r is not null then raise exception 'Future observation accepted'; end if;
  r:=public.capture_nba_pregame_research(999990004,'scouting:v1',1,tip,origin-interval '2 seconds','{"players":[{"id":1}],"issues":["Tracking refresh delayed; showing last captured sample"],"marker":1}');
  r:=public.capture_nba_pregame_research(999990004,'scouting:v1',1,tip,origin-interval '1 second','{"players":[{"id":1}],"issues":["Roster coverage incomplete"],"marker":2}');
  if r#>>'{payload,marker}' is distinct from '1' then raise exception 'Partial scouting replaced complete'; end if;
end $test$;
reset role;
select 'passed' as database_boundary_and_permissions, count(*) as temporary_fixture_rows from public.nba_pregame_research where game_id in(999990001,999990002,999990003,999990004);
rollback;
