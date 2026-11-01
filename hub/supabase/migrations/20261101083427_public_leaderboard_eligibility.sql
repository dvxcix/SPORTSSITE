-- The result is used only by the server after fetching a
-- cached ranking; it must never be cached or exposed as an independent API.
do $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regprocedure('public.get_current_public_leaderboard_ids(uuid[])') is not null
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attname in ('is_private','hide_win_rate') and atttypid='boolean'::regtype and not attisdropped) <> 2
    or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid='public.users'::regclass and i.indisunique and i.indisvalid and i.indisready and am.amname='btree' and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='id')
    or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
    or not pg_catalog.has_table_privilege('service_role','public.users','SELECT')
  then raise exception 'Leaderboard privacy preflight failed'; end if;
end $$;

create function public.get_current_public_leaderboard_ids(target_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog as $$
begin
  if target_ids is null or pg_catalog.cardinality(target_ids)>10000
    or pg_catalog.array_position(target_ids,null::uuid) is not null
  then raise exception using errcode='22023', message='Invalid leaderboard IDs'; end if;
  return (select coalesce(pg_catalog.jsonb_agg(u.id order by u.id),'[]'::jsonb)
    from public.users u where u.id=any(target_ids)
      and u.is_private is false and u.hide_win_rate is false);
end $$;
revoke all on function public.get_current_public_leaderboard_ids(uuid[]) from public,anon,authenticated;
grant execute on function public.get_current_public_leaderboard_ids(uuid[]) to service_role;
do $$
begin
  if pg_catalog.has_function_privilege('anon','public.get_current_public_leaderboard_ids(uuid[])','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','public.get_current_public_leaderboard_ids(uuid[])','EXECUTE')
    or not pg_catalog.has_function_privilege('service_role','public.get_current_public_leaderboard_ids(uuid[])','EXECUTE')
  then raise exception 'Leaderboard privacy function grants are unsafe'; end if;
end $$;
