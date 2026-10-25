-- Run only after the individually reviewed migration. Every fixture rolls back.
begin;
do $$
declare
  fixture text := '999925102501';
  cutoff timestamptz := clock_timestamp()+interval '2 hours';
  observed timestamptz := clock_timestamp()-interval '5 seconds';
  body jsonb := '{"researchComplete":true,"homeLineup":[{"mlb_id":1,"name_norm":"a"}],"awayLineup":[{"mlb_id":2,"name_norm":"b"}],"homeLineupConfirmed":true,"awayLineupConfirmed":true,"homePitcher":{"id":3,"name_norm":"starter a"},"awayPitcher":{"id":4},"pitcherSplits":[{"mlb_id":3,"win":"season","pct_fastball":70},{"mlb_id":4,"win":"season","pct_fastball":60}],"statSplits":[{"mlb_id":1,"xhr":5}],"precomputedStatcastByBatter":{"1":{"R":{"season":{"barrelPct":10},"l1":{"barrelPct":20}}}},"precomputedPitchlogByBatter":{},"matchupEdgeByBatter":{},"matchupEdgeByPitcher":{"3":{"recentByPitchTypeByHand":{"L":{"FF":{"pitches":10}}}}},"mechanicsByPlayer":{},"bdlByMlbId":{"1":{"sa":{"fanduel":450}}},"bdlByName":{"starter a":{"strikeouts":{"fanduel":120}}},"pikkitByName":{},"fhrAvgMap":{},"saAvgMap":{},"openingSaRbi":[{"name_norm":"a","sa_open":450}],"noHrCurrent":900,"noHrOpen":850}'::jsonb;
  result jsonb;
  degraded jsonb;
begin
  if exists(select 1 from public.mlb_research_clock where game_pk=fixture) then raise exception 'Fixture ID already used'; end if;
  if has_table_privilege('authenticated','public.mlb_pregame_research','SELECT') or has_table_privilege('anon','public.mlb_pregame_research','INSERT')
    or has_function_privilege('authenticated','public.capture_mlb_pregame_research(text,text,timestamptz,timestamptz,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.read_mlb_pregame_research(text,text,timestamptz)','EXECUTE') then raise exception 'Research archive ACL failed'; end if;
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed,body);
  if result->'payload' is distinct from body then raise exception 'Healthy initial capture failed'; end if;
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed-interval '1 second',jsonb_set(body,'{noHrCurrent}','950'));
  if result->'payload' is distinct from body then raise exception 'Older write replaced winner'; end if;
  degraded := body #- '{precomputedStatcastByBatter,1,R,l1}';
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Missing nested window replaced healthy input'; end if;
  degraded := body #- '{bdlByMlbId,1,sa,fanduel}';
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Missing quote replaced healthy input'; end if;
  degraded := jsonb_set(body,'{pitcherSplits}','[]');
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Empty pitcher mix replaced healthy input'; end if;
  degraded := jsonb_set(body,'{pitcherSplits,0,pct_fastball}','null');
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Same-count pitcher mix null accepted'; end if;
  degraded := body #- '{matchupEdgeByPitcher,3,recentByPitchTypeByHand,L,FF,pitches}';
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Pitcher matchup data loss accepted'; end if;
  degraded := body #- '{bdlByName,starter a,strikeouts,fanduel}';
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Pitcher price loss accepted'; end if;
  degraded := body - 'noHrCurrent' - 'noHrOpen';
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Game price loss accepted'; end if;
  degraded := jsonb_set(body,'{openingSaRbi}','[]');
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Opening price loss accepted'; end if;
  degraded := jsonb_set(body,'{statSplits,0,xhr}','null');
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from body then raise exception 'Same-player null field replaced healthy input'; end if;
  degraded := jsonb_set(body,'{homePitcher}', '{"id":5,"name_norm":"starter b"}') #- '{matchupEdgeByPitcher,3}' #- '{bdlByName,starter a}';
  degraded := jsonb_set(degraded,'{pitcherSplits,0,mlb_id}','5');
  degraded := jsonb_set(degraded,'{homeLineup}','[{"mlb_id":6,"name_norm":"f"}]');
  degraded := degraded #- '{precomputedStatcastByBatter,1}' #- '{bdlByMlbId,1}';
  degraded := jsonb_set(degraded,'{statSplits}','[{"mlb_id":6,"xhr":7}]');
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed+interval '1 second',degraded);
  if result->'payload' is distinct from degraded then raise exception 'Legitimate starter/lineup replacement rejected'; end if;
  body := degraded;
  result := public.capture_mlb_pregame_research(fixture,'pitchlog:1',cutoff,observed,'{"rows":[{"game_date":"2026-10-24","batter_id":1}]}'::jsonb);
  if result->'payload'->'rows'->0->>'batter_id' is distinct from '1' then raise exception 'Custom provider resource failed'; end if;
  -- An earlier canonical start permanently wins over a later schedule.
  update public.mlb_research_clock set start_at=clock_timestamp()-interval '1 second' where game_pk=fixture;
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff+interval '1 day',observed+interval '2 seconds',jsonb_set(body,'{noHrCurrent}','990'));
  if result->'payload' is distinct from body then raise exception 'Late write or delayed schedule reopened game'; end if;
  result := public.capture_mlb_pregame_research(fixture,'pitchlog:2',cutoff,observed,'{"rows":[]}'::jsonb);
  if result is not null then raise exception 'Unseen historical custom input was synthesized'; end if;
  -- Transaction time must never authorize a write after its wall-clock cutoff.
  fixture := '999925102502'; cutoff := clock_timestamp()+interval '50 milliseconds';
  perform public.read_mlb_pregame_research(fixture,'board:v1',cutoff);
  perform pg_sleep(0.07);
  result := public.capture_mlb_pregame_research(fixture,'board:v1',cutoff,observed,body);
  if result is not null then raise exception 'Transaction-time late write accepted'; end if;
  raise notice 'MLB archive ACL/capture/quality/canonical-start/custom/late-transaction checks passed';
end $$;
rollback;
