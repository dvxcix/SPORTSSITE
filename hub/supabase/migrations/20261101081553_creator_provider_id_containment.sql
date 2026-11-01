-- Preserve all existing non-target SELECT access and all write grants/RLS.
-- Column-level restrictions make API-role wildcard SELECT fail on these tables.
do $$
declare
  entry record;
  rel oid;
  who text;
  old_columns text[];
  new_columns text[];
  other_columns text;
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname in ('anon','authenticated'))
    or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
  then raise exception 'Creator ID containment role preflight failed'; end if;
  for entry in select * from (values
    ('creator_entitlements','whop_membership_id'),
    ('subscriptions','stripe_subscription_id')
  ) as t(relation_name,private_column) loop
    rel := pg_catalog.to_regclass(pg_catalog.format('public.%I',entry.relation_name));
    if rel is null or not exists (select 1 from pg_catalog.pg_class where oid=rel and relkind='r' and relrowsecurity)
      or not exists (select 1 from pg_catalog.pg_attribute where attrelid=rel and attname=entry.private_column and atttypid='text'::regtype and not attisdropped)
      or exists (select 1 from pg_catalog.pg_class t cross join lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) acl where t.oid=rel and acl.grantee=0 and acl.privilege_type='SELECT')
      or exists (select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.attrelid=rel and a.attname=entry.private_column and acl.grantee=0 and acl.privilege_type='SELECT')
      or not pg_catalog.has_column_privilege('service_role',rel,entry.private_column,'SELECT')
    then raise exception 'Creator ID containment schema preflight failed for %',entry.relation_name; end if;
    foreach who in array array['anon','authenticated'] loop
      if not pg_catalog.has_table_privilege(who,rel,'SELECT') then raise exception 'Unexpected table SELECT for %, %',who,entry.relation_name; end if;
      select array_agg(a.attname::text order by a.attname::text), string_agg(pg_catalog.quote_ident(a.attname),', ' order by a.attname::text)
        into old_columns,other_columns from pg_catalog.pg_attribute a where a.attrelid=rel and a.attnum>0 and not a.attisdropped and a.attname<>entry.private_column and pg_catalog.has_column_privilege(who,rel,a.attname,'SELECT');
      if old_columns is null then raise exception 'No permitted public columns for %, %',who,entry.relation_name; end if;
      execute pg_catalog.format('revoke select on table public.%I from %I',entry.relation_name,who);
      execute pg_catalog.format('revoke select (%I) on public.%I from %I',entry.private_column,entry.relation_name,who);
      execute pg_catalog.format('grant select (%s) on public.%I to %I',other_columns,entry.relation_name,who);
      select array_agg(a.attname::text order by a.attname::text) into new_columns from pg_catalog.pg_attribute a where a.attrelid=rel and a.attnum>0 and not a.attisdropped and a.attname<>entry.private_column and pg_catalog.has_column_privilege(who,rel,a.attname,'SELECT');
      if old_columns is distinct from new_columns or pg_catalog.has_column_privilege(who,rel,entry.private_column,'SELECT') or not pg_catalog.has_column_privilege('service_role',rel,entry.private_column,'SELECT')
        then raise exception 'Creator ID containment postcondition failed for %, %',who,entry.relation_name; end if;
    end loop;
  end loop;
end $$;
notify pgrst,'reload schema';
