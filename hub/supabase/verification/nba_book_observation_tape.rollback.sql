-- Run after the individually reviewed migration, inside this rollback-only test.
-- Function clones use temporary tables and their own identity sequences.
begin;
set local statement_timeout='30s';
do $$ declare name text;definition text;target text;begin
 foreach name in array array['nba_source_cache','nba_odds_phase_games','nba_odds_phase_openings','nba_book_quote_scopes','nba_book_quote_captures','nba_odds_phase_captures','nba_market_captures','nba_first_basket_captures','nba_game_market_captures'] loop
  execute format('create temporary table %I (like public.%I including all)',name,name);
 end loop;
 foreach name in array array['nba_phase_cutoff(bigint,timestamptz)','read_nba_phase_frames_scoped(bigint,text,text,timestamptz,text,text,bigint,timestamptz)','record_nba_book_frames(bigint,date,timestamptz,text,text,jsonb)','read_nba_book_frames(bigint,text,text,timestamptz,text,text,bigint,timestamptz)'] loop
  definition:=pg_get_functiondef(('public.'||name)::regprocedure);
  foreach target in array array['nba_source_cache','nba_odds_phase_games','nba_odds_phase_openings','nba_book_quote_scopes','nba_book_quote_captures','nba_odds_phase_captures','nba_market_captures','nba_first_basket_captures','nba_game_market_captures','nba_phase_cutoff','read_nba_phase_frames_scoped','record_nba_book_frames','read_nba_book_frames'] loop
   definition:=replace(definition,'public.'||target,'pg_temp.'||target);
  end loop;
  execute definition;
 end loop;
end $$;

create function pg_temp.book_quote(g bigint,p bigint,m text,k text,l text,price integer,observed timestamptz,b text default 'betmgm') returns jsonb language sql as $$
 select jsonb_build_object('id',-5000000000000-p,'game_id',g,'player_id',p,'vendor',b,'prop_type',m,'line_value',l,
 'market',jsonb_build_object('type',k,case when k='milestone' then 'odds' else 'over_odds' end,price),'updated_at',observed);
$$;
create function pg_temp.book_frame(g bigint,m text,k text,l numeric,observed timestamptz,tip timestamptz,quotes jsonb,complete boolean default true,b text default 'betmgm') returns jsonb language sql as $$
 select jsonb_build_object('gameId',g,'book',b,'tipoff',tip,'observedAt',observed,'props',quotes,'complete',complete,'contract',jsonb_build_object('market',m,'type',k,'line',l));
$$;

do $$ declare
 g bigint:=99999123401;stamp timestamptz:=clock_timestamp();tip timestamptz:=clock_timestamp()+interval '2 hours';
 a timestamptz;b timestamptz;c timestamptz;d timestamptz;e timestamptz;f jsonb;q jsonb;reply jsonb;row_value record;failed boolean;n integer;before_count integer;
begin
 a:=stamp-interval '4 minutes';b:=stamp-interval '3 minutes';c:=stamp-interval '2 minutes';d:=stamp-interval '1 minute';e:=stamp-interval '30 seconds';
 -- An older real opening must survive the new atomic direct observation.
 insert into pg_temp.nba_odds_phase_games(game_id,tipoff_at) values(g,tip);
 insert into pg_temp.nba_odds_phase_openings(game_id,mode,player_id,vendor,market,market_type,line,side,odds,observed_at)
 values(g,'pregame',434,'betmgm','points','milestone',30,'over',450,a-interval '1 hour');
 q:=pg_temp.book_quote(g,434,'points','milestone','30',400,a);
 f:=pg_temp.book_frame(g,'points','milestone',30,a,tip,jsonb_build_array(q));
 reply:=pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 if reply<>jsonb_build_object('cached',1,'captured',1,'unchanged',0) then raise exception 'Initial atomic save failed: %',reply;end if;
 if (select odds from pg_temp.nba_odds_phase_openings where game_id=g and player_id=434)<>450 then raise exception 'Opening mutated';end if;
 reply:=pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 if (reply->>'unchanged')::int<>1 or (select count(*) from pg_temp.nba_book_quote_captures where game_id=g)<>1 then raise exception 'Retry duplicated tape';end if;
 -- An unchanged new observation is durable; only the identical retry dedupes.
 f:=pg_temp.book_frame(g,'points','milestone',30,b,tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',400,b)));
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 if (select count(*) from pg_temp.nba_book_quote_captures where game_id=g)<>2 then raise exception 'New unchanged observation was lost';end if;
 if (select fetched_at from pg_temp.nba_source_cache limit 1)<>b then raise exception 'Cache did not retain actual observation';end if;
 -- Partial rows never enter tape/openings, even if one verified sibling changes.
 f:=pg_temp.book_frame(g,'points','milestone',30,c,tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',425,c)),false);
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 if (select count(*) from pg_temp.nba_book_quote_captures where game_id=g)<>2 then raise exception 'Partial panel archived';end if;
 -- Full change, verified locked withdrawal, and return to A each persist.
 f:=pg_temp.book_frame(g,'points','milestone',30,d-interval '20 seconds',tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',425,d-interval '20 seconds')));
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 f:=pg_temp.book_frame(g,'points','milestone',30,d,tip,'[]'::jsonb);
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 f:=pg_temp.book_frame(g,'points','milestone',30,e,tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',400,e)));
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 if (select count(*) from pg_temp.nba_book_quote_captures where game_id=g)<>5 then raise exception 'Changed/withdrawal/A-B-A observations missing';end if;
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','props',tip,'latest',null,null,d);
 if row_value.captured_at<>d or row_value.book_contracts->0->'quotes'<>'[]'::jsonb then raise exception 'Exact withdrawal unavailable in reader';end if;
 -- Metadata timeline combines base events and book-only events with exact predecessor.
 insert into pg_temp.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes)
 values(g,current_date,'pregame','props',c-interval '5 seconds',repeat('a',64),jsonb_build_array(pg_temp.book_quote(g,435,'points','milestone','15',200,c-interval '5 seconds')));
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','props',tip,'latest',null,null,e);
 if row_value.captured_at<>e or row_value.base_captured_at<>c-interval '5 seconds' or jsonb_array_length(row_value.quotes)<>1
 or (row_value.book_contracts->0->'quotes'->0->'market'->>'odds')::int<>400 then raise exception 'Combined predecessor state incorrect';end if;
 select count(*) into n from pg_temp.read_nba_book_frames(g,'pregame','props',tip,'edges',null,null,null);
 if n<>2 then raise exception 'Edges not bounded';end if;
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','props',tip,'latest','points',999,null);
 if row_value.quotes<>'[]'::jsonb or row_value.book_contracts->0->'quotes'<>'[]'::jsonb then raise exception 'Player scope leaked';end if;
 if exists(select 1 from pg_temp.read_nba_book_frames(g,'live','props',tip,'history',null,null,null)) then raise exception 'Pregame leaked into live';end if;
 -- Different First Basket contracts retain separate openings and history.
 foreach n in array array[1,2] loop
  q:=pg_temp.book_quote(g,434,case when n=1 then 'first_score' else 'first_field_goal' end,'over_under','0.5',900,e,case when n=1 then 'draftkings' else 'betmgm' end);
  f:=pg_temp.book_frame(g,'unused','over_under',.5,e,tip,jsonb_build_array(q),true,case when n=1 then 'draftkings' else 'betmgm' end);
  perform pg_temp.record_nba_book_frames(g,current_date,tip,'first',case when n=1 then 'draftkings' else 'betmgm' end,jsonb_build_array(f));
 end loop;
 if (select count(*) from pg_temp.nba_odds_phase_openings where game_id=g and market in('first_score','first_field_goal'))<>2 then raise exception 'First contracts collapsed';end if;
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','first',tip,'latest',null,null,null);
 if jsonb_array_length(row_value.book_contracts)<>2 then raise exception 'First states missing';end if;
 select count(*) into n from pg_temp.read_nba_book_frames(g,'pregame','first',tip,'recent',null,null,null);
 if n<>1 then raise exception 'First recent timeline malformed';end if;
 -- Filtering a nonempty First feed down to empty does not verify withdrawal.
 insert into pg_temp.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes)
 values(g,current_date,'pregame','first',e+interval '1 second',repeat('c',64),jsonb_build_array(pg_temp.book_quote(g,435,'first_score','over_under','0.5',1000,e,'draftkings')));
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','first',tip,'latest',null,434,null);
 if row_value.quotes<>'[]'::jsonb or row_value.base_absence_complete then raise exception 'Filtered First absence falsely verified';end if;
 insert into pg_temp.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes)
 values(g,current_date,'pregame','first',e+interval '2 seconds',repeat('d',64),'[]'::jsonb);
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','first',tip,'latest',null,434,null);
 if not row_value.base_absence_complete then raise exception 'Explicit empty First base not verified';end if;
 -- Every rejection rolls back both cache and tape. Identical raw duplicates cannot hide in DISTINCT helper.
 select count(*) into before_count from pg_temp.nba_source_cache;
 for n in 1..8 loop
  q:=pg_temp.book_quote(g,434,'points','milestone','35',400,stamp-interval '1 second');
  f:=pg_temp.book_frame(g,'points','milestone',35,stamp-interval '1 second',tip,jsonb_build_array(q));
  if n=1 then f:=jsonb_set(f,'{props}',jsonb_build_array(q,q));
  elsif n=2 then f:=jsonb_set(f,'{props,0,player_id}','12345678901234'::jsonb);
  elsif n=3 then f:=jsonb_set(f,'{props,0,line_value}','"35.5"'::jsonb);
  elsif n=4 then f:=jsonb_set(f,'{props,0,market,odds}','99'::jsonb);
  elsif n=5 then f:=jsonb_set(f,'{props,0,updated_at}',to_jsonb(stamp+interval '1 hour'));
  elsif n=6 then f:=pg_temp.book_frame(g,'points','milestone',30,a,tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',400,a)));
  elsif n=7 then f:=pg_temp.book_frame(g,'points','milestone',35,stamp-interval '6 minutes',tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','35',400,stamp-interval '6 minutes')));
  elsif n=8 then f:=jsonb_set(f,'{props,0,game_id}',to_jsonb(g+1));end if;
  failed:=false;
  begin perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));exception when others then failed:=true;end;
  if not failed then raise exception 'Invalid fixture % accepted',n;end if;
 end loop;
 if (select count(*) from pg_temp.nba_source_cache)<>before_count then raise exception 'Rejected input wrote cache';end if;
 -- A later conflicting same-time frame rolls back an earlier valid sibling.
 failed:=false;
 begin
  perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(
   pg_temp.book_frame(g,'points','milestone',35,stamp-interval '1 second',tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','35',400,stamp-interval '1 second'))),
   pg_temp.book_frame(g,'points','milestone',30,e,tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',999,e)))));
 exception when others then failed:=true;end;
 if not failed or (select count(*) from pg_temp.nba_source_cache)<>before_count or exists(select 1 from pg_temp.nba_book_quote_scopes where game_id=g and line=35) then raise exception 'Sibling rollback failed';end if;
 -- Fresh same-price observation survives a later base-feed absence.
 insert into pg_temp.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes)
 values(g,current_date,'pregame','props',e+interval '1 second',repeat('e',64),'[]'::jsonb);
 f:=pg_temp.book_frame(g,'points','milestone',30,stamp-interval '10 seconds',tip,jsonb_build_array(pg_temp.book_quote(g,434,'points','milestone','30',400,stamp-interval '10 seconds')));
 perform pg_temp.record_nba_book_frames(g,current_date,tip,'props','betmgm',jsonb_build_array(f));
 select * into row_value from pg_temp.read_nba_book_frames(g,'pregame','props',tip,'latest',null,null,null);
 if (row_value.book_contracts->0->>'observed_at')::timestamptz<=row_value.base_captured_at then raise exception 'Same-price fresh observation remained withdrawn';end if;
 -- A provider start pushed into the future cannot reopen the persisted old tip.
 insert into pg_temp.nba_odds_phase_games(game_id,tipoff_at) values(g+1,stamp-interval '1 minute');
 failed:=false;
 begin
  f:=pg_temp.book_frame(g+1,'points','milestone',30,e,tip,jsonb_build_array(pg_temp.book_quote(g+1,434,'points','milestone','30',400,e)));
  perform pg_temp.record_nba_book_frames(g+1,current_date,tip,'props','betmgm',jsonb_build_array(f));
 exception when others then failed:=true;end;
 if not failed then raise exception 'Canonical tip reopened';end if;
 -- >96 base metadata frames still return exactly original opening + latest95.
 insert into pg_temp.nba_odds_phase_captures(game_id,game_date,mode,feed,captured_at,fingerprint,quotes)
 select g+2,current_date,'pregame','game',stamp-interval '5 minutes'+i*interval '1 second',repeat('b',64),'[]'::jsonb from generate_series(1,101)i;
 select count(*) into n from pg_temp.read_nba_book_frames(g+2,'pregame','game',tip,'history',null,null,null);
 if n<>96 then raise exception 'History selection limit failed: %',n;end if;
 if (select min(captured_at) from pg_temp.read_nba_book_frames(g+2,'pregame','game',tip,'history',null,null,null))<>stamp-interval '5 minutes'+interval '1 second' then raise exception 'Opening metadata omitted';end if;
 raise notice 'Book tape atomicity, partial hold, changed history, withdrawals, exact First contracts, phase cutoff and bounded combined reader passed';
end $$;

do $$ declare role_name text;relation_name text;function_name text;begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach relation_name in array array['nba_book_quote_scopes','nba_book_quote_captures'] loop
   if has_table_privilege(role_name,'public.'||relation_name,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Public book tape table privilege';end if;
  end loop;
  foreach function_name in array array['record_nba_book_frames(bigint,date,timestamptz,text,text,jsonb)','read_nba_book_frames(bigint,text,text,timestamptz,text,text,bigint,timestamptz)'] loop
   if has_function_privilege(role_name,'public.'||function_name,'EXECUTE') then raise exception 'Public book tape RPC privilege';end if;
  end loop;
 end loop;
 if has_table_privilege('service_role','public.nba_book_quote_captures','UPDATE,DELETE') then raise exception 'Append-only tape mutable';end if;
 if exists(select 1 from pg_class where oid in('public.nba_book_quote_scopes'::regclass,'public.nba_book_quote_captures'::regclass) and not relrowsecurity) then raise exception 'Missing RLS';end if;
 raise notice 'Service-only grants and RLS verified';
end $$;
rollback;
