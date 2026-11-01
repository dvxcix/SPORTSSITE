-- Supports privacy for users.admin_granted_tier while preserving the original
-- authenticated changelog audience policy and no anonymous SELECT policy.
do $$
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regclass('public.changelog_entries') is null
    or pg_catalog.to_regnamespace('private') is null
    or pg_catalog.to_regprocedure('private.current_user_changelog_flags()') is not null
    or not pg_catalog.has_schema_privilege('authenticated','private','USAGE')
    or pg_catalog.has_schema_privilege('anon','private','USAGE')
    or not pg_catalog.has_table_privilege(current_user,'public.users','SELECT')
    or not exists (select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or not exists (
      select 1 from pg_catalog.pg_policy p
      where p.polrelid='public.changelog_entries'::regclass
        and p.polname='Changelog select by audience' and p.polcmd='r' and p.polpermissive
        and p.polroles=array[(select oid from pg_catalog.pg_roles where rolname='authenticated')]
        and md5(pg_catalog.pg_get_expr(p.polqual,p.polrelid))='5b75187a007b0a49dbbff1dda5eee459'
    )
  then raise exception 'Changelog privacy preflight failed'; end if;
end $$;

-- Encodes only the authenticated caller's admin/ultimate booleans. There is no
-- caller-supplied user identifier and no raw member data in the result.
create function private.current_user_changelog_flags() returns integer
language sql stable security definer set search_path = pg_catalog as $fn$
  select coalesce((select
    (case when u.account_type='admin' then 1 else 0 end)
    + (case when u.tier='ultimate' or u.admin_granted_tier='ultimate' or u.beta_access_active=true then 2 else 0 end)
    from public.users u where u.id=(select auth.uid())),0)
$fn$;
revoke all on function private.current_user_changelog_flags() from public, anon;
grant execute on function private.current_user_changelog_flags() to authenticated, service_role;

drop policy "Changelog select by audience" on public.changelog_entries;
create policy "Changelog select by audience" on public.changelog_entries as permissive for select to authenticated using (
  ((select private.current_user_changelog_flags()) & 1) <> 0
  or (is_active and (audience_tier='all' or
    (audience_tier='ultimate' and ((select private.current_user_changelog_flags()) & 2) <> 0)))
);

do $$
begin
  if pg_catalog.has_function_privilege('anon','private.current_user_changelog_flags()','EXECUTE')
    or not pg_catalog.has_function_privilege('authenticated','private.current_user_changelog_flags()','EXECUTE')
    or not exists (select 1 from pg_catalog.pg_proc where oid='private.current_user_changelog_flags()'::regprocedure
      and prosecdef and provolatile='s' and proconfig @> array['search_path=pg_catalog'])
  then raise exception 'Changelog privacy postcondition failed'; end if;
end $$;
