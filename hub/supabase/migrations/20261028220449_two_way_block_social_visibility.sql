-- Separate, reviewed SELECT protection for posts and repost activity.
-- Apply only after 20261028215600_restrict_private_profile_reposts has been
-- applied and verified; never replay the migration history tree.
-- Guest visibility and owners' own records are preserved. Existing profile,
-- source-post, entitlement, insert, update and delete rules remain intact.
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $preflight$
begin
  if to_regclass('public.posts') is null or to_regclass('public.reposts') is null
    or to_regclass('public.blocks') is null or to_regclass('public.users') is null
    or to_regclass('public.follows') is null or to_regclass('public.creator_entitlements') is null
    or to_regprocedure('auth.uid()') is null or to_regprocedure('private.is_owner_only_post(uuid)') is null
    or not (select relrowsecurity from pg_class where oid='public.posts'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.reposts'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.blocks'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.users'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.follows'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.creator_entitlements'::regclass) then
    raise exception 'Block visibility prerequisites differ from reviewed baseline';
  end if;
  -- Exact preceding SELECT/ALL rules ensure the posts lookup in the prior
  -- repost policy applies the new author-block check without policy recursion.
  -- The blocks SELECT policy itself only references auth.uid() and block IDs.
  if (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='posts' and cmd in ('SELECT','ALL')) is distinct from '0d28a8f76d93bcf9faaa47c0cd08a3e6'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='reposts' and cmd in ('SELECT','ALL')) is distinct from 'bbf633a4516d390929ab1a99bad51d18'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='blocks' and cmd in ('SELECT','ALL')) is distinct from '022065260319ed37cddce4f4c17795a9'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='users' and cmd in ('SELECT','ALL')) is distinct from 'c7fe7ec85101c641278eda7a1e19966f'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='follows' and cmd in ('SELECT','ALL')) is distinct from '345bc59d7307de486d9b0c7a05232854'
    or (select md5(string_agg(policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'<null>')||':'||coalesce(with_check,'<null>'),'|' order by policyname))
      from pg_policies where schemaname='public' and tablename='creator_entitlements' and cmd in ('SELECT','ALL')) is distinct from '832a8ea949ecc8de8945c828deed1eed'
    or md5(pg_get_functiondef('private.is_owner_only_post(uuid)'::regprocedure)) <> '9d5e650d7b8263226e060e3f14b8f1e9'
    or exists(select 1 from (values ('anon'),('authenticated')) r(role_name)
      where not has_table_privilege(r.role_name,'public.blocks','SELECT')
        or not has_table_privilege(r.role_name,'public.posts','SELECT')
        or not has_table_privilege(r.role_name,'public.reposts','SELECT')
        or not has_table_privilege(r.role_name,'public.users','SELECT')
        or not has_table_privilege(r.role_name,'public.follows','SELECT')
        or not has_table_privilege(r.role_name,'public.creator_entitlements','SELECT')
        or not has_function_privilege(r.role_name,'auth.uid()','EXECUTE'))
    or exists(select 1 from pg_policies where schemaname='public' and policyname in ('Posts respect two-way account blocks','Reposts respect two-way account blocks') and tablename in ('posts','reposts')) then
    raise exception 'Block visibility policies or privileges differ from reviewed baseline';
  end if;
end
$preflight$;

create policy "Posts respect two-way account blocks"
on public.posts as restrictive for select to public
using (
  (select auth.uid()) is null or author_id = (select auth.uid())
  or not exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = posts.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = posts.author_id)
  )
);

create policy "Reposts respect two-way account blocks"
on public.reposts as restrictive for select to public
using (
  (select auth.uid()) is null or user_id = (select auth.uid())
  or not exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = reposts.user_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = reposts.user_id)
  )
);

-- Public profile metadata in public.users is intentionally unchanged; this
-- change governs post and repost SELECT, not directory/profile visibility,
-- write authorization, custom service-role access or every realtime event.
