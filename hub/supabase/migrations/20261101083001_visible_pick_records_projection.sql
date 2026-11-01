-- Fetches at most 100 profiles per request, derives the viewer only from the
-- verified JWT context, and returns only public wins/losses/pushes.
do $$ begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regprocedure('public.get_visible_pick_records(uuid[])') is not null
    or not exists (select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or pg_catalog.to_regprocedure('auth.uid()') is null
    or pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regclass('public.follows') is null
    or pg_catalog.to_regclass('public.blocks') is null
    or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid='public.users'::regclass and i.indisprimary and i.indisvalid and i.indisready and i.indnkeyatts=1 and i.indpred is null and am.amname='btree' and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='id')
    or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid='public.follows'::regclass and i.indisprimary and i.indisvalid and i.indisready and i.indnkeyatts=2 and i.indpred is null and am.amname='btree' and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='follower_id' and pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='following_id')
    or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid='public.blocks'::regclass and i.indisprimary and i.indisvalid and i.indisready and i.indnkeyatts=2 and i.indpred is null and am.amname='btree' and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='blocker_id' and pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='blocked_id')
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attname='pick_record' and atttypid='jsonb'::regtype and not attisdropped)
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attname in ('is_private','hide_win_rate') and atttypid='boolean'::regtype and not attisdropped) <> 2
  then raise exception 'Visible record projection preflight failed'; end if;
end $$;
create function public.get_visible_pick_records(target_ids uuid[])
returns table(profile_id uuid, pick_record jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  viewer uuid := auth.uid();
begin
  if target_ids is null or cardinality(target_ids) > 100 or array_position(target_ids, null::uuid) is not null then
    raise exception using errcode='22023', message='Invalid profile IDs';
  end if;
  return query
    select u.id,
      case when
        (u.id = viewer or (
          u.hide_win_rate is false
          and not exists (
            select 1 from public.blocks b
            where (b.blocker_id=viewer and b.blocked_id=u.id)
               or (b.blocker_id=u.id and b.blocked_id=viewer)
          )
          and (
            u.is_private is false
            or (u.is_private is true and exists (
              select 1 from public.follows f where f.follower_id=viewer and f.following_id=u.id
            ))
          )
        ))
        and jsonb_typeof(u.pick_record)='object'
        and jsonb_typeof(u.pick_record->'wins')='number'
        and jsonb_typeof(u.pick_record->'losses')='number'
        and jsonb_typeof(u.pick_record->'pushes')='number'
        and u.pick_record->>'wins' ~ '^[0-9]{1,9}$'
        and u.pick_record->>'losses' ~ '^[0-9]{1,9}$'
        and u.pick_record->>'pushes' ~ '^[0-9]{1,9}$'
      then jsonb_build_object('wins',u.pick_record->'wins','losses',u.pick_record->'losses','pushes',u.pick_record->'pushes')
      else null end
    from public.users u
    where u.id = any(target_ids);
end $$;
revoke all on function public.get_visible_pick_records(uuid[]) from public;
grant execute on function public.get_visible_pick_records(uuid[]) to anon, authenticated, service_role;
