begin;
do $$
declare data jsonb := '[{"player_id":1,"prop_type":"points"},{"player_id":2,"prop_type":"rebounds"}]'; n integer; rejected boolean:=false;
begin
  if not public.record_nba_market_capture(9999999999,current_date,'a',data) then raise exception 'First capture missing'; end if;
  if public.record_nba_market_capture(9999999999,current_date,'a',data) then raise exception 'Unchanged capture duplicated'; end if;
  if not public.record_nba_market_capture(9999999999,current_date,'b',data) then raise exception 'Changed capture missing'; end if;
  select count(*) into n from public.read_nba_market_captures(9999999999,'points',1) f where jsonb_array_length(f.props)=1 and f.props->0->>'player_id'='1';
  if n<>2 then raise exception 'Player/market read filtering failed'; end if;
  begin perform public.record_nba_market_capture(9999999999,current_date,'c','[]'); exception when others then if sqlerrm<>'Invalid NBA snapshot' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Empty capture accepted'; end if;
  if has_function_privilege('anon','public.read_nba_market_captures(bigint,text,bigint)','execute') or has_function_privilege('authenticated','public.record_nba_market_capture(bigint,date,text,jsonb)','execute') or has_table_privilege('authenticated','public.nba_market_captures','select') then raise exception 'NBA archive exposed'; end if;
end $$;
rollback;
select 'NBA archive deduplication, filtering, empty rejection, permissions passed; fixtures rolled back' as verification;
