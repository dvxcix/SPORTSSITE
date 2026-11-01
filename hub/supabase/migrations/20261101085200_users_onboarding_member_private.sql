-- REVIEW/STAGING CANDIDATE ONLY. Apply only after the compatible application
-- is live and verified. This changes SELECT alone, never INSERT/UPDATE.
do $$
declare
  protected constant text[] := array['is_active_member','onboarding_completed_at'];
  who text;
  item text;
  before_other text[];
  after_other text[];
  before_write text[];
  after_write text[];
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regclass('public.users') is null
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attnum>0 and not attisdropped and attname=any(protected)) <> cardinality(protected)
    or exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname in ('anon','authenticated'))
    or exists (select 1 from pg_catalog.pg_class t cross join lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) acl where t.oid='public.users'::regclass and acl.grantee=0 and acl.privilege_type='SELECT')
    or exists (select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.attrelid='public.users'::regclass and a.attname=any(protected || array['email']) and acl.grantee=0 and acl.privilege_type='SELECT')
    or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
    or pg_catalog.to_regprocedure('public.get_own_onboarding_complete()') is null
    or not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
      where p.oid=pg_catalog.to_regprocedure('public.get_own_onboarding_complete()') and p.prosecdef
      and p.proconfig = array['search_path=pg_catalog'] and (r.rolsuper or r.rolbypassrls)
      and pg_catalog.md5(p.prosrc)='e27d09bdff3315dc0a71d24d48174292'
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'))
    or exists (select 1 from pg_catalog.pg_policy p where concat(pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ~* '(is_active_member|onboarding_completed_at)')
  then raise exception 'Onboarding and membership containment preflight failed'; end if;
  foreach who in array array['anon','authenticated'] loop
    if pg_catalog.has_table_privilege(who,'public.users','SELECT') or pg_catalog.has_column_privilege(who,'public.users','email','SELECT')
    then raise exception 'Unexpected table or email select for %',who; end if;
    foreach item in array protected loop
      if not pg_catalog.has_column_privilege(who,'public.users',item,'SELECT') or not pg_catalog.has_column_privilege('service_role','public.users',item,'SELECT')
      then raise exception 'Unexpected select privilege for %, %',who,item; end if;
    end loop;
    select array_agg(a.attname::text order by a.attname::text) into before_other from pg_catalog.pg_attribute a
      where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped and not(a.attname=any(protected)) and pg_catalog.has_column_privilege(who,'public.users',a.attname,'SELECT');
    select array_agg(a.attname::text||':'||priv order by a.attname::text,priv) into before_write from pg_catalog.pg_attribute a cross join unnest(array['INSERT','UPDATE']) priv
      where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped and pg_catalog.has_column_privilege(who,'public.users',a.attname,priv);
    execute pg_catalog.format('revoke select (%s) on public.users from %I',
      (select string_agg(pg_catalog.quote_ident(name), ', ' order by name) from unnest(protected) name),who);
    select array_agg(a.attname::text order by a.attname::text) into after_other from pg_catalog.pg_attribute a
      where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped and not(a.attname=any(protected)) and pg_catalog.has_column_privilege(who,'public.users',a.attname,'SELECT');
    select array_agg(a.attname::text||':'||priv order by a.attname::text,priv) into after_write from pg_catalog.pg_attribute a cross join unnest(array['INSERT','UPDATE']) priv
      where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped and pg_catalog.has_column_privilege(who,'public.users',a.attname,priv);
    if before_other is distinct from after_other or before_write is distinct from after_write or pg_catalog.has_column_privilege(who,'public.users','email','SELECT') then raise exception 'Unrelated privilege changed for %',who; end if;
    foreach item in array protected loop
      if pg_catalog.has_column_privilege(who,'public.users',item,'SELECT') or not pg_catalog.has_column_privilege('service_role','public.users',item,'SELECT') then raise exception 'Onboarding and membership postcondition failed for %, %',who,item; end if;
    end loop;
  end loop;
end $$;
notify pgrst, 'reload schema';
