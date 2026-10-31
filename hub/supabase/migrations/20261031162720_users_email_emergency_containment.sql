-- Emergency containment: block direct email reads while preserving every
-- other current public.users SELECT column, existing RLS and service access.
-- This does not protect the other private fields on public.users.
do $$
declare
  other_columns text;
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);
  if pg_catalog.to_regclass('public.users') is null
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.users'::regclass and attname = 'email' and not attisdropped)
     or not pg_catalog.has_table_privilege('anon', 'public.users', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.users', 'SELECT')
     or exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname in ('anon','authenticated'))
     or exists (select 1 from pg_catalog.pg_class t cross join lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) acl where t.oid='public.users'::regclass and acl.grantee=0 and acl.privilege_type='SELECT')
     or exists (select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.attrelid='public.users'::regclass and a.attname='email' and acl.grantee=0 and acl.privilege_type='SELECT')
     or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
  then raise exception 'Email containment preflight failed'; end if;
  select pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' order by attnum)
    into other_columns
    from pg_catalog.pg_attribute
    where attrelid='public.users'::regclass and attnum>0 and not attisdropped and attname <> 'email';
  if other_columns is null then raise exception 'No compatible public profile columns'; end if;
  revoke select on public.users from anon, authenticated;
  revoke select (email) on public.users from anon, authenticated;
  execute pg_catalog.format('grant select (%s) on public.users to anon, authenticated', other_columns);
  if pg_catalog.has_column_privilege('anon', 'public.users', 'email', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.users', 'email', 'SELECT')
     or not pg_catalog.has_column_privilege('service_role', 'public.users', 'email', 'SELECT')
  then raise exception 'Email containment validation failed'; end if;
end $$;
notify pgrst, 'reload schema';
