-- Individually reviewed repair. No historical results are changed here.
do $$ begin
  if to_regclass('public.picks') is null or to_regclass('public.posts') is null
    or to_regprocedure('public.settle_nba_pick_exact(uuid,text)') is null then
    raise exception 'Expected member settlement schema is missing';
  end if;
  if to_regclass('public.sport_settlement_attempts') is not null
    or to_regprocedure('public.settle_member_pick_exact(uuid,text,jsonb,jsonb)') is not null then
    raise exception 'Exact member settlement repair already exists';
  end if;
end $$;

create table public.sport_settlement_attempts (
  pick_id uuid primary key references public.picks(id) on delete cascade,
  checked_at timestamptz not null
);
alter table public.sport_settlement_attempts enable row level security;
revoke all on public.sport_settlement_attempts from public,anon,authenticated,service_role;
grant select,insert,update on public.sport_settlement_attempts to service_role;

create function public.pending_sport_settlement(p_sport text,p_limit integer default 200)
returns setof public.picks language sql security invoker set search_path='' as $$
  select p.* from public.picks p
  left join public.sport_settlement_attempts a on a.pick_id=p.id
  where p.sport=p_sport and p_sport in ('MLB','NFL') and p.result='pending'
  order by a.checked_at asc nulls first,p.created_at,p.id
  limit least(200,greatest(0,coalesce(p_limit,0)));
$$;

create function public.settle_member_pick_exact(p_pick_id uuid,p_result text,p_expected jsonb,p_prop_type_map jsonb default '{}'::jsonb)
returns table(applied boolean,leg_player_name text,leg_headshot_url text,overall_result text)
language plpgsql security invoker set search_path='' as $$
declare
  v_pick public.picks; v_post public.posts; v_data jsonb; v_leg jsonb; v_legs jsonb := '[]';
  v_pick_type text; v_leg_type text; v_count integer := 0;
  v_parent_id uuid; v_owner_id uuid; v_sport text;
  v_pending boolean := false; v_loss boolean := false; v_push boolean := true; v_final text;
begin
  if p_result is null or p_result not in ('win','loss','push') then raise exception 'Invalid settlement result'; end if;
  if jsonb_typeof(p_prop_type_map) is distinct from 'object' or octet_length(p_prop_type_map::text)>10000 then raise exception 'Invalid market aliases'; end if;
  select * into v_pick from public.picks where id=p_pick_id and sport in ('MLB','NFL');
  if not found then return query select false,null::text,null::text,null::text; return; end if;
  v_parent_id:=v_pick.post_id; v_owner_id:=v_pick.user_id; v_sport:=v_pick.sport;
  -- Lock the parent before any leg, as the NBA writer does. Concurrent workers
  -- cannot overwrite another leg or emit a second applied notification.
  if v_pick.post_id is not null then
    select * into v_post from public.posts where id=v_pick.post_id for update;
    if not found or v_post.author_id is distinct from v_pick.user_id or v_post.sport is distinct from v_pick.sport then
      raise exception 'Member settlement post mismatch';
    end if;
  end if;
  select * into v_pick from public.picks where id=p_pick_id and sport in ('MLB','NFL') for update;
  if not found or v_pick.post_id is distinct from v_parent_id or v_pick.user_id is distinct from v_owner_id or v_pick.sport is distinct from v_sport then
    raise exception 'Member contract changed during settlement';
  end if;
  if jsonb_build_object('sport',v_pick.sport,'game_pk',v_pick.game_pk,'mlb_id',v_pick.mlb_id,'player_id',v_pick.player_id,
    'pick_type',v_pick.pick_type,'market_side',v_pick.market_side,'numeric_line',v_pick.numeric_line,'book',v_pick.book,'line',v_pick.line,
    'post_id',v_pick.post_id,'user_id',v_pick.user_id) is distinct from p_expected then raise exception 'Member decision contract changed'; end if;
  if v_pick.result is distinct from 'pending' then return query select false,null::text,null::text,null::text; return; end if;
  if v_pick.game_pk is null or v_pick.pick_type is null or (v_pick.sport='MLB' and v_pick.mlb_id is null)
    or (v_pick.sport='NFL' and v_pick.player_id is null) then raise exception 'Incomplete member contract'; end if;
  v_pick_type := case when v_pick.sport='MLB' then coalesce(p_prop_type_map->>v_pick.pick_type,v_pick.pick_type) else v_pick.pick_type end;
  if v_pick.sport='MLB' and v_pick_type='pa1' then v_pick_type:='first_pa_hr'; end if;
  if v_pick.post_id is not null then
    v_data:=v_post.pick_data;
    if jsonb_typeof(v_data) is distinct from 'object' then raise exception 'Member post contract missing'; end if;
    for v_leg in select value from jsonb_array_elements(case when jsonb_typeof(v_data->'legs')='array' then v_data->'legs' else jsonb_build_array(v_data) end) loop
      v_leg_type:=case when v_pick.sport='MLB' then coalesce(p_prop_type_map->>(v_leg->>'prop_key'),v_leg->>'prop_key') else v_leg->>'prop_key' end;
      if v_pick.sport='MLB' and v_leg_type='pa1' then v_leg_type:='first_pa_hr'; end if;
      -- The two verified legacy single posts store their game only on posts.
      -- That exact parent game may identify a single pick, never a parlay leg.
      if coalesce(v_leg->>'game_pk',case when jsonb_typeof(v_data->'legs') is distinct from 'array' and v_post.post_type='pick' then v_post.game_pk end)=v_pick.game_pk and v_leg_type=v_pick_type
        and (case when v_pick.sport='MLB' then v_leg->>'mlb_id'=v_pick.mlb_id::text else v_leg->>'player_id'=v_pick.player_id end)
        and coalesce(v_leg->>'market_side','milestone')=coalesce(v_pick.market_side,'milestone')
        and (v_leg->>'numeric_line')::numeric is not distinct from v_pick.numeric_line
        and coalesce(v_leg->>'book',v_data->>'book') is not distinct from v_pick.book then
        v_count:=v_count+1;
        if coalesce(v_leg->>'result','pending')<>'pending' then raise exception 'Member leg already differs from pick'; end if;
        leg_player_name:=v_leg->>'player_name'; leg_headshot_url:=v_leg->>'headshot_url';
        v_leg:=jsonb_set(v_leg,'{result}',to_jsonb(p_result));
      end if;
      v_legs:=v_legs||jsonb_build_array(v_leg);
      v_pending:=v_pending or coalesce(v_leg->>'result','pending')='pending';
      v_loss:=v_loss or coalesce(v_leg->>'result','pending')='loss';
      v_push:=v_push and coalesce(v_leg->>'result','pending')='push';
    end loop;
    if v_count<>1 then raise exception 'Exact member leg missing or ambiguous'; end if;
    v_final:=case when v_pending then 'pending' when v_loss then 'loss' when v_push then 'push' else 'win' end;
    if v_final<>'pending' and coalesce(v_data->>'result','pending')='pending' then overall_result:=v_final; end if;
    v_data:=case when jsonb_typeof(v_data->'legs')='array' then jsonb_set(v_data,'{legs}',v_legs) else v_legs->0 end;
    v_data:=jsonb_set(v_data,'{result}',to_jsonb(v_final));
    update public.posts set pick_data=v_data where id=v_pick.post_id;
  end if;
  update public.picks set result=p_result,graded_at=clock_timestamp() where id=p_pick_id;
  applied:=true; return next;
end;
$$;

revoke all on function public.pending_sport_settlement(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.settle_member_pick_exact(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pending_sport_settlement(text,integer) to service_role;
grant execute on function public.settle_member_pick_exact(uuid,text,jsonb,jsonb) to service_role;
