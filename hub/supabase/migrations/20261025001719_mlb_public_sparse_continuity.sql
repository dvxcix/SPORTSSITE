-- Reviewed repair. Replaces one read-only RPC; no captures, state, or history are rewritten.
set lock_timeout='2s';
set statement_timeout='8s';
do $guard$
begin
  if to_regprocedure('public.read_mlb_public_captures(date)') is null
    or md5(pg_get_functiondef('public.read_mlb_public_captures(date)'::regprocedure)) <> 'd0d2ba55fbe0e0dd9524ddd1b5f516da'
    then raise exception 'MLB public reader definition changed; review before applying'; end if;
  if has_function_privilege('anon','public.read_mlb_public_captures(date)','execute')
    or has_function_privilege('authenticated','public.read_mlb_public_captures(date)','execute')
    or not has_function_privilege('service_role','public.read_mlb_public_captures(date)','execute')
    then raise exception 'MLB public reader permissions changed; review before applying'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and tablename='mlb_public_captures'
    and indexname='mlb_public_captures_game_time'
    and indexdef like '%(game_id, game_date, game_key, captured_at DESC, id DESC)%')
    then raise exception 'Required bounded MLB capture index unavailable'; end if;
end
$guard$;

create or replace function public.read_mlb_public_captures(p_game_date date)
returns table(game_id bigint,game_key text,starts_at timestamptz,captured_at timestamptz,observed_at timestamptz,rows jsonb)
language sql stable security invoker set search_path='' as $function$
  with games as materialized (
    select s.game_id,s.game_key,s.starts_at,s.observed_at
    from public.mlb_public_capture_state s
    where s.game_date=p_game_date and s.observed_at<s.starts_at
    order by s.game_id limit 40
  ), selected as materialized (
    select s.game_id,s.game_key,s.starts_at,s.observed_at,c.id,c.captured_at
    from games s cross join lateral (
      -- Select only indexed metadata before touching the stored JSON payload.
      -- 40 games x 24 frames stays below the Data API's 1000-row response cap.
      select h.id,h.captured_at from public.mlb_public_captures h
      where h.game_id=s.game_id and h.game_date=p_game_date and h.game_key=s.game_key
        and h.captured_at<s.starts_at and h.captured_at<=statement_timestamp()
      order by h.captured_at desc,h.id desc limit 24
    ) c
  )
  select s.game_id,s.game_key,s.starts_at,s.captured_at,s.observed_at,h.rows
  from selected s join public.mlb_public_captures h on h.id=s.id
  order by s.game_id,s.captured_at desc,s.id desc;
$function$;
revoke all on function public.read_mlb_public_captures(date) from public,anon,authenticated;
grant execute on function public.read_mlb_public_captures(date) to service_role;
