-- Server-only transaction; API validates session, kickoff and exact prices first.
create or replace function public.create_tracked_pick_post(p_post jsonb, p_picks jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_post public.posts; v_id uuid; v_pick_ids uuid[]; v_previous_sub text;
begin
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) not between 1 and 30 then
    raise exception 'Invalid pick legs';
  end if;
  v_post := jsonb_populate_record(null::public.posts, p_post);
  if v_post.author_id is null or v_post.post_type not in ('pick','parlay') then
    raise exception 'Invalid pick post';
  end if;
  -- The server-only caller already verified this author with auth.getUser().
  -- Preserve the existing per-author limiter, which reads auth.uid().
  v_previous_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', v_post.author_id::text, true);
  if not private.check_rate_limit('post:' || v_post.author_id::text, 10, 300) then
    raise exception 'Please wait before posting again';
  end if;
  insert into public.posts(author_id,content,post_type,sport,game_pk,book,combined_odds,
    wager_amount,potential_payout,pick_data,media_urls,visibility,group_id,page_id)
  values(v_post.author_id,v_post.content,v_post.post_type,v_post.sport,v_post.game_pk,v_post.book,
    v_post.combined_odds,v_post.wager_amount,v_post.potential_payout,v_post.pick_data,
    coalesce(v_post.media_urls,'{}'),v_post.visibility,v_post.group_id,v_post.page_id)
  returning id into v_id;
  with inserted as (
    insert into public.picks(user_id,post_id,sport,game_pk,game_date,mlb_id,player_id,
      pick_type,market_side,numeric_line,team,player_name,line,odds,book,result)
    select v_post.author_id,v_id,v_post.sport,p.game_pk,p.game_date,p.mlb_id,p.player_id,
      p.pick_type,p.market_side,p.numeric_line,p.team,p.player_name,p.line,p.odds,p.book,'pending'
    from jsonb_populate_recordset(null::public.picks,p_picks) p returning id
  ) select array_agg(id) into v_pick_ids from inserted;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub,''), true);
  return jsonb_build_object('id',v_id,'pickIds',v_pick_ids,'picksTracked',true);
end;
$$;
revoke all on function public.create_tracked_pick_post(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_tracked_pick_post(jsonb,jsonb) to service_role;

-- Permit NFL evidence links without changing workspace ownership policies.
alter table public.research_workspace_items drop constraint research_workspace_items_source_path_check;
alter table public.research_workspace_items add constraint research_workspace_items_source_path_check
  check (char_length(source_path) between 1 and 1000 and source_path ~ '^/(dugout|the-sideline)(\?|$)');
