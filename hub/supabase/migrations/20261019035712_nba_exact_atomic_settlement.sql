-- NBA-only, service-callable atomic settlement. Existing MLB/NFL RPCs unchanged.
create function public.settle_nba_pick_exact(p_pick_id uuid, p_result text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_pick public.picks; v_post public.posts; v_leg jsonb;
  v_legs jsonb := '[]'; v_data jsonb; v_found boolean := false;
  v_pending boolean := false; v_loss boolean := false; v_all_push boolean := true;
begin
  if p_result not in ('win','loss','push') or p_result is null then raise exception 'Invalid result'; end if;
  select * into v_pick from public.picks where id=p_pick_id and sport='NBA';
  if not found then return false; end if;
  -- Always lock parent before child, serializing concurrent legs of a parlay.
  if v_pick.post_id is not null then
    select * into v_post from public.posts where id=v_pick.post_id for update;
    if not found or v_post.sport is distinct from 'NBA' or v_post.author_id is distinct from v_pick.user_id then raise exception 'NBA post mismatch'; end if;
  end if;
  select * into v_pick from public.picks where id=p_pick_id and sport='NBA' for update;
  if v_pick.result is distinct from 'pending' then return false; end if;
  if v_pick.post_id is not null then
    v_data := v_post.pick_data;
    if jsonb_typeof(v_data->'legs')='array' then
      for v_leg in select value from jsonb_array_elements(v_data->'legs') loop
        if v_leg->>'player_id'=v_pick.player_id and v_leg->>'game_pk'=v_pick.game_pk
          and v_leg->>'prop_key'=v_pick.pick_type and v_leg->>'market_side'=v_pick.market_side
          and (v_leg->>'numeric_line')::numeric=v_pick.numeric_line then
          v_found := true;
          v_leg := jsonb_set(v_leg,'{result}',to_jsonb(p_result));
        end if;
        v_legs := v_legs || jsonb_build_array(v_leg);
        v_pending := v_pending or coalesce(v_leg->>'result','pending')='pending';
        v_loss := v_loss or coalesce(v_leg->>'result','pending')='loss';
        v_all_push := v_all_push and coalesce(v_leg->>'result','pending')='push';
      end loop;
      if not v_found then raise exception 'Exact NBA leg missing'; end if;
      v_data := jsonb_set(jsonb_set(v_data,'{legs}',v_legs),'{result}',
        to_jsonb(case when v_pending then 'pending' when v_loss then 'loss' when v_all_push then 'push' else 'win' end));
    else
      if v_data->>'player_id' is distinct from v_pick.player_id or v_data->>'game_pk' is distinct from v_pick.game_pk
        or v_data->>'prop_key' is distinct from v_pick.pick_type or v_data->>'market_side' is distinct from v_pick.market_side
        or (v_data->>'numeric_line')::numeric is distinct from v_pick.numeric_line then raise exception 'Exact NBA leg missing'; end if;
      v_data := jsonb_set(v_data,'{result}',to_jsonb(p_result));
    end if;
    update public.posts set pick_data=v_data where id=v_pick.post_id;
  end if;
  update public.picks set result=p_result,graded_at=now() where id=p_pick_id;
  return true;
end;
$$;
revoke all on function public.settle_nba_pick_exact(uuid,text) from public, anon, authenticated;
grant execute on function public.settle_nba_pick_exact(uuid,text) to service_role;
