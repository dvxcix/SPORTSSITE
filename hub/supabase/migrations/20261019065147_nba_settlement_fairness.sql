-- Fair bounded NBA settlement scans; unresolved appearances cannot starve later picks.
create table public.nba_settlement_attempts(pick_id uuid primary key references public.picks(id) on delete cascade,checked_at timestamptz not null default now());
alter table public.nba_settlement_attempts enable row level security;
revoke all on public.nba_settlement_attempts from public,anon,authenticated;
grant select,insert,update on public.nba_settlement_attempts to service_role;
create index nba_pending_pick_scan on public.picks(created_at,id) where sport='NBA' and result='pending';
create or replace function public.claim_pending_nba_picks(p_limit integer default 200)
returns table(id uuid,post_id uuid,game_pk text,player_id text,player_name text,pick_type text,market_side text,numeric_line numeric) language plpgsql security invoker set search_path=public as $$
begin
 if p_limit<1 or p_limit>500 then raise exception 'Invalid NBA settlement batch';end if;
 perform pg_advisory_xact_lock(hashtextextended('nba-settlement-scan',0));
 return query with candidates as materialized(
  select p.id,p.created_at from public.picks p left join public.nba_settlement_attempts a on a.pick_id=p.id
  where p.sport='NBA' and p.result='pending' and p.game_pk is not null and p.player_id is not null and p.game_date<=(now() at time zone 'America/New_York')::date
  order by a.checked_at nulls first,p.created_at,p.id limit p_limit
 ), claimed as(
  insert into public.nba_settlement_attempts(pick_id,checked_at) select c.id,clock_timestamp() from candidates c
  on conflict(pick_id) do update set checked_at=excluded.checked_at returning pick_id
 ) select p.id,p.post_id,p.game_pk::text,p.player_id::text,p.player_name::text,p.pick_type::text,p.market_side::text,p.numeric_line::numeric from public.picks p join claimed c on c.pick_id=p.id order by p.created_at,p.id;
end $$;
revoke all on function public.claim_pending_nba_picks(integer) from public,anon,authenticated;
grant execute on function public.claim_pending_nba_picks(integer) to service_role;
create or replace function public.settle_nba_pick_exact(p_pick_id uuid, p_result text)
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
  if v_pick.post_id is not null then
    insert into public.notifications(user_id,type,message,link,target_id,target_type)
    values(v_pick.user_id,'pick_result','NBA pick settled: '||coalesce(v_pick.player_name,'Player')||' — '||upper(p_result),'/posts/'||v_pick.post_id,v_pick.post_id,'post');
  end if;
  return true;
end;
$$;
revoke all on function public.settle_nba_pick_exact(uuid,text) from public, anon, authenticated;
grant execute on function public.settle_nba_pick_exact(uuid,text) to service_role;
