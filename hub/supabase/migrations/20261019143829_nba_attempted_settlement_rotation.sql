-- Selection alone is not an attempt: budget-skipped picks must keep priority.
-- Apply only this reviewed repair. Exact settlement and privacy are unchanged.
do $$
begin
  if md5(pg_get_functiondef('public.claim_pending_nba_picks(integer)'::regprocedure)) <> '97b74fd2ce997ec943aa14a573b4f31a' then
    raise exception 'NBA settlement selector changed; review the live definition';
  end if;
end $$;

create or replace function public.claim_pending_nba_picks(p_limit integer default 200)
returns table(id uuid,post_id uuid,game_pk text,player_id text,player_name text,pick_type text,market_side text,numeric_line numeric)
language plpgsql security invoker set search_path=public as $$
begin
  if p_limit<1 or p_limit>500 then raise exception 'Invalid NBA settlement batch'; end if;
  -- Concurrent callers may observe the same candidates; settle_nba_pick_exact
  -- remains the atomic, idempotent write. Only the worker checkpoints attempts.
  return query
    select p.id,p.post_id,p.game_pk::text,p.player_id::text,p.player_name::text,p.pick_type::text,p.market_side::text,p.numeric_line::numeric
    from public.picks p left join public.nba_settlement_attempts a on a.pick_id=p.id
    where p.sport='NBA' and p.result='pending' and p.game_pk is not null and p.player_id is not null
      and p.game_date<=(now() at time zone 'America/New_York')::date
    order by a.checked_at nulls first,p.created_at,p.id limit p_limit;
end $$;
revoke all on function public.claim_pending_nba_picks(integer) from public,anon,authenticated;
grant execute on function public.claim_pending_nba_picks(integer) to service_role;
