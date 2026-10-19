-- Disposable fixtures only. The entire save/post/settle verification rolls back.
begin;
do $$
declare
  owner_id uuid; saved_id uuid; result jsonb; v_post_id uuid; pick_ids uuid[];
  legs jsonb; post_data jsonb; original_count integer; did_apply boolean;
begin
  select id into owner_id from public.users where account_type='admin' order by id limit 1;
  if owner_id is null then raise exception 'Admin fixture owner unavailable'; end if;
  select count(*) into original_count from public.watchlist_items where user_id=owner_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  set local role authenticated;
  insert into public.watchlist_items(user_id,sport,game_pk,game_date,player_name,prop_key,prop_label,line,book,odds)
    values(owner_id,'nba','123',current_date,'NBA verification','nba:434:points:over_under:20:over','Over 20 Points','20','fanduel',-110) returning id into saved_id;
  if not exists(select 1 from public.watchlist_items where id=saved_id and prop_key='nba:434:points:over_under:20:over' and odds=-110) then raise exception 'Saved identity missing'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.watchlist_items where id=saved_id) then raise exception 'Saved pick visible to another owner'; end if;
  reset role;
  legs := jsonb_build_array(
    jsonb_build_object('player_id','bdl:434','player_name','NBA verification','game_pk','123','game_date',current_date,'prop_key','points','pick_type','points','market_side','over','numeric_line',20,'line','20','odds',-110,'book','fanduel','result','pending'),
    jsonb_build_object('player_id','bdl:434','player_name','NBA verification','game_pk','123','game_date',current_date,'prop_key','points','pick_type','points','market_side','over','numeric_line',25,'line','25','odds',-110,'book','fanduel','result','pending'),
    jsonb_build_object('player_id','bdl:434','player_name','NBA verification','game_pk','123','game_date',current_date,'prop_key','points','pick_type','points','market_side','under','numeric_line',20,'line','20','odds',-110,'book','fanduel','result','pending'));
  result := public.create_tracked_pick_post(jsonb_build_object('author_id',owner_id,'content','NBA rollback verification','post_type','parlay','sport','NBA','book','fanduel','visibility','public','pick_data',jsonb_build_object('legs',legs,'result','pending')),legs);
  v_post_id := (result->>'id')::uuid;
  if not coalesce((result->>'picksTracked')::boolean,false) or (select count(*) from public.picks where picks.post_id=v_post_id) < 3 then raise exception 'Posting not atomic'; end if;
  select array_agg(id order by numeric_line,market_side) into pick_ids from public.picks p where p.post_id=v_post_id;
  select id into saved_id from public.picks p where p.post_id=v_post_id and market_side='over' and numeric_line=20;
  if not public.settle_nba_pick_exact(saved_id,'win') then raise exception 'First result not applied'; end if;
  if public.settle_nba_pick_exact(saved_id,'loss') then raise exception 'Replay changed a final pick'; end if;
  select pick_data into post_data from public.posts where id=v_post_id;
  if post_data->'legs'->0->>'result'<>'win' or post_data->'legs'->1->>'result'<>'pending' or post_data->'legs'->2->>'result'<>'pending' then raise exception 'Exact line/side isolation failed'; end if;
  if post_data->>'result'<>'pending' then raise exception 'Parlay finalized early'; end if;
  select id into saved_id from public.picks p where p.post_id=v_post_id and market_side='over' and numeric_line=25;
  perform public.settle_nba_pick_exact(saved_id,'loss');
  select id into saved_id from public.picks p where p.post_id=v_post_id and market_side='under';
  perform public.settle_nba_pick_exact(saved_id,'push');
  select pick_data into post_data from public.posts where id=v_post_id;
  if post_data->>'result'<>'loss' then raise exception 'Parlay loss rollup failed'; end if;
  -- A straight push uses the same atomic path and stays consistent in My Picks.
  result := public.create_tracked_pick_post(jsonb_build_object('author_id',owner_id,'content','NBA rollback straight','post_type','pick','sport','NBA','book','fanduel','visibility','public','pick_data',legs->0),jsonb_build_array(legs->0));
  saved_id := (result->'pickIds'->>0)::uuid;
  perform public.settle_nba_pick_exact(saved_id,'push');
  if not exists(select 1 from public.picks p join public.posts s on s.id=p.post_id where p.id=saved_id and p.result='push' and s.pick_data->>'result'='push') then raise exception 'Straight rollup failed'; end if;
  result := public.create_tracked_pick_post(jsonb_build_object('author_id',owner_id,'content','NBA rollback mismatch','post_type','pick','sport','NBA','book','fanduel','visibility','public','pick_data',jsonb_set(legs->0,'{numeric_line}','99')),jsonb_build_array(legs->0));
  saved_id := (result->'pickIds'->>0)::uuid;
  did_apply := false;
  begin
    perform public.settle_nba_pick_exact(saved_id,'win');
  exception when others then
    if sqlerrm <> 'Exact NBA leg missing' then raise; end if;
    did_apply := true;
  end;
  if not did_apply or not exists(select 1 from public.picks p where p.id=saved_id and p.result='pending') then raise exception 'Mismatch did not roll back'; end if;
  if has_function_privilege('anon','public.settle_nba_pick_exact(uuid,text)','execute') or has_function_privilege('authenticated','public.settle_nba_pick_exact(uuid,text)','execute') then raise exception 'Settlement privileges too broad'; end if;
  if not has_function_privilege('service_role','public.settle_nba_pick_exact(uuid,text)','execute') then raise exception 'Service settlement unavailable'; end if;
end;
$$;
rollback;
select 'NBA save/post/exact grading/replay/parlay/straight/permissions checks passed; fixtures rolled back' as verification;
