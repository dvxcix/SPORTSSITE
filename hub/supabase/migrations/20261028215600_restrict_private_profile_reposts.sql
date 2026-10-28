-- Narrow privacy repair: preserve all existing insert/delete and original-post
-- policies. Review live policy state and execute only this migration, never the
-- historical migration tree. No SECURITY DEFINER function or grants change.
set local lock_timeout = '5s';
set local statement_timeout = '15s';
do $preflight$
begin
  if to_regclass('public.reposts') is null or to_regclass('public.users') is null
    or to_regclass('public.follows') is null or to_regclass('public.posts') is null
    or to_regclass('public.creator_entitlements') is null
    or to_regprocedure('private.is_owner_only_post(uuid)') is null then
    raise exception 'Repost privacy prerequisites missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.reposts'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.users'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.follows'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.posts'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.creator_entitlements'::regclass) then
    raise exception 'RLS state differs from reviewed baseline';
  end if;
  if md5(pg_get_functiondef('private.is_owner_only_post(uuid)'::regprocedure)) <> '9d5e650d7b8263226e060e3f14b8f1e9'
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='reposts'
      and policyname='Private posts cannot be reposted' and cmd='ALL' and permissive='RESTRICTIVE'
      and roles='{public}'::name[] and qual='(NOT private.is_owner_only_post(post_id))' and with_check='(NOT private.is_owner_only_post(post_id))')
    or not exists(select 1 from pg_policies where schemaname='public' and tablename='reposts'
      and policyname='Reposts public' and cmd='SELECT' and permissive='PERMISSIVE' and roles='{public}'::name[] and qual='true')
    or exists(select 1 from pg_policies where schemaname='public' and tablename='reposts'
      and policyname='Private profile reposts follow profile visibility')
    or (select count(*) from pg_policies where schemaname='public' and tablename='reposts' and cmd in ('SELECT','ALL')) <> 2 then
    raise exception 'Repost policies differ from reviewed baseline';
  end if;
  -- Exact SELECT/ALL policy digests guard roles, recursion, entitlement rules,
  -- and the restrictive original-post policy. Any future drift needs review.
  if (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='users' and cmd in ('SELECT','ALL')) is distinct from 'c7fe7ec85101c641278eda7a1e19966f'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='follows' and cmd in ('SELECT','ALL')) is distinct from '345bc59d7307de486d9b0c7a05232854'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='posts' and cmd in ('SELECT','ALL')) is distinct from '0d28a8f76d93bcf9faaa47c0cd08a3e6'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='creator_entitlements' and cmd in ('SELECT','ALL')) is distinct from '832a8ea949ecc8de8945c828deed1eed'
    or exists(select 1 from (values ('anon'),('authenticated')) r(role_name)
      where not has_table_privilege(r.role_name,'public.users','SELECT') or not has_table_privilege(r.role_name,'public.follows','SELECT')
        or not has_table_privilege(r.role_name,'public.posts','SELECT') or not has_table_privilege(r.role_name,'public.creator_entitlements','SELECT')) then
    raise exception 'Repost policy lookup permissions differ from reviewed baseline';
  end if;
end
$preflight$;

-- A public member's repost remains public; a private member's activity is
-- visible only to that member and followers. Missing/unknown privacy fails closed.
-- Nonowners must also be able to read the original under its existing RLS;
-- owners may retain their own activity and delete it even after access changes.
-- The existing restrictive original-post rule still applies independently.
create policy "Private profile reposts follow profile visibility"
on public.reposts as restrictive for select to public
using (
  user_id = (select auth.uid())
  or (exists (select 1 from public.posts p where p.id = reposts.post_id) and exists (
    select 1 from public.users u
    where u.id = reposts.user_id
      and (u.is_private = false or (u.is_private = true and exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid()) and f.following_id = u.id
      )))
  ))
);
