-- Revoke only API-role SELECT for six private profile fields. Existing UPDATE,
-- service privileges, original row data and RLS policies are unchanged.
-- Requires the tested compatible application release and real API checks.
do $$
declare
  field_name text;
  role_name text;
  old_anon_update boolean;
  old_auth_update boolean;
  fields constant text[] := array[
    'notification_settings','notification_delivery_settings','interest_settings',
    'dugout_column_prefs','onboarding_complete','updated_at'
  ];
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.has_table_privilege('anon','public.users','SELECT')
    or pg_catalog.has_table_privilege('authenticated','public.users','SELECT')
    or exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname in ('anon','authenticated'))
    or exists (select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) acl where c.oid='public.users'::regclass and acl.grantee=0 and acl.privilege_type='SELECT')
    or exists (select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.attrelid='public.users'::regclass and a.attname=any(fields) and acl.grantee=0 and acl.privilege_type='SELECT')
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attname=any(fields) and attnum>0 and not attisdropped) <> 6
    or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
  then raise exception 'Private settings grant preflight failed'; end if;
  foreach field_name in array fields loop
    if not pg_catalog.has_column_privilege('anon','public.users',field_name,'SELECT')
      or not pg_catalog.has_column_privilege('authenticated','public.users',field_name,'SELECT')
      or not pg_catalog.has_column_privilege('service_role','public.users',field_name,'SELECT')
    then raise exception 'Unexpected current SELECT grants for %',field_name; end if;
  end loop;
  foreach field_name in array fields loop
    old_anon_update := pg_catalog.has_column_privilege('anon','public.users',field_name,'UPDATE');
    old_auth_update := pg_catalog.has_column_privilege('authenticated','public.users',field_name,'UPDATE');
    execute pg_catalog.format('revoke select (%I) on public.users from anon, authenticated',field_name);
    foreach role_name in array array['anon','authenticated'] loop
      if pg_catalog.has_column_privilege(role_name,'public.users',field_name,'SELECT') then raise exception 'Private settings SELECT still available for %',field_name; end if;
    end loop;
    if pg_catalog.has_column_privilege('anon','public.users',field_name,'UPDATE') <> old_anon_update
      or pg_catalog.has_column_privilege('authenticated','public.users',field_name,'UPDATE') <> old_auth_update
      or not pg_catalog.has_column_privilege('service_role','public.users',field_name,'SELECT')
    then raise exception 'Private settings unrelated privileges changed for %',field_name; end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
