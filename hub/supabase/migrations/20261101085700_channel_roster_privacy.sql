-- Applied to primary as 20261101085710; do not replay.
-- Preserve own membership visibility used by channels RLS. Other rows require
-- access to both their channel and, if present, their group.
do $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if not exists (select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or pg_catalog.to_regprocedure('private.can_view_channel_roster(uuid,uuid)') is not null
    or pg_catalog.to_regprocedure('private.can_access_channel(uuid,uuid)') is null
    or pg_catalog.to_regprocedure('private.can_view_group(uuid,uuid)') is null
    or exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
      where p.oid in ('private.can_access_channel(uuid,uuid)'::regprocedure,'private.can_view_group(uuid,uuid)'::regprocedure)
        and (not p.prosecdef or not (r.rolsuper or r.rolbypassrls)))
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('private.can_access_channel(uuid,uuid)'::regprocedure)) <> 'b057fb001e943f2e192c0dae173deebc'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('private.can_view_group(uuid,uuid)'::regprocedure)) <> '347d1636c3914c2a3e9fe658a33c8403'
    or pg_catalog.to_regclass('public.channel_members') is null
    or pg_catalog.to_regclass('public.channels') is null
    or pg_catalog.to_regclass('public.groups') is null
    or (select count(*) from pg_catalog.pg_policy where polrelid='public.channel_members'::regclass and polcmd in ('r','*')) <> 1
    or not exists (select 1 from pg_catalog.pg_policy where polrelid='public.channel_members'::regclass and polname='Members visible' and polcmd='r' and polpermissive and polroles=array[0::oid] and pg_catalog.pg_get_expr(polqual,polrelid)='true')
    or not exists (select 1 from pg_catalog.pg_class c where c.oid='public.channel_members'::regclass and c.relrowsecurity and not c.relforcerowsecurity)
  then raise exception 'Channel membership privacy preflight failed'; end if;
end $$;

create function private.can_view_channel_roster(target_id uuid, target_user_id uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.channels c left join public.groups g on g.id=c.group_id
    where c.id=target_id
      and (c.group_id is null or (g.id is not null and (
        pg_catalog.lower(pg_catalog.btrim(coalesce(g.sport,''))) <> 'mlb'
        or exists(select 1 from public.users u where u.id=(select auth.uid()) and u.account_type='admin')
      )))
      and (
        ((select auth.uid()) is not null and target_user_id=(select auth.uid()))
        or ((select auth.uid()) is null and c.channel_type='public' and c.creator_product_id is null
          and (c.group_id is null or (g.is_public is true and g.access_type='free')))
        or ((select auth.uid()) is not null
          and private.can_access_channel(c.id,(select auth.uid()))
          and (c.group_id is null or private.can_view_group(c.group_id,(select auth.uid()))))
    )
  )
$$;
revoke all on function private.can_view_channel_roster(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_view_channel_roster(uuid,uuid) to anon,authenticated;
drop policy "Members visible" on public.channel_members;
create policy "Members visible" on public.channel_members for select to public
  using (private.can_view_channel_roster(channel_id,user_id));
