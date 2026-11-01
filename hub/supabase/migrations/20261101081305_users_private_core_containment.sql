-- This blocks 21 billing, Discord, creator and grant metadata fields. It is
-- intentionally NOT the full users privacy repair. It preserves email denial.
do $$
declare
  protected constant text[] := array[
    'stripe_customer_id','stripe_account_id','whop_user_id','whop_membership_id',
    'membership_expires_at','stripe_connect_onboarded','stripe_connect_charges_enabled',
    'stripe_connect_payouts_enabled','whop_plan_id','tier_status','tier_current_period_end',
    'admin_granted_tier_by','admin_granted_tier_at','admin_granted_tier_note',
    'tier_purchased_at','tier_cancel_at_period_end','discord_id','discord_username',
    'whop_connected_company_id','creator_commerce_status','creator_commerce_updated_at'
  ];
  who text;
  item text;
  before_other text[];
  after_other text[];
begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regclass('public.users') is null
    or (select count(*) from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attnum>0 and not attisdropped and attname=any(protected)) <> cardinality(protected)
    or exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.member where r.rolname in ('anon','authenticated'))
    or exists (select 1 from pg_catalog.pg_class t cross join lateral pg_catalog.aclexplode(coalesce(t.relacl,pg_catalog.acldefault('r',t.relowner))) acl where t.oid='public.users'::regclass and acl.grantee=0 and acl.privilege_type='SELECT')
    or exists (select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) acl where a.attrelid='public.users'::regclass and a.attname=any(protected || array['email']) and acl.grantee=0 and acl.privilege_type='SELECT')
    or not exists (select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls)
  then raise exception 'Private user containment preflight failed'; end if;

  foreach who in array array['anon','authenticated'] loop
    if pg_catalog.has_table_privilege(who,'public.users','SELECT')
      or pg_catalog.has_column_privilege(who,'public.users','email','SELECT')
    then raise exception 'Role % has table select or email select', who; end if;
    foreach item in array protected loop
      if not pg_catalog.has_column_privilege(who,'public.users',item,'SELECT')
        or pg_catalog.has_column_privilege(who,'public.users',item,'INSERT')
        or pg_catalog.has_column_privilege(who,'public.users',item,'UPDATE')
        or not pg_catalog.has_column_privilege('service_role','public.users',item,'SELECT')
      then raise exception 'Unexpected privileges for role %, column %', who, item; end if;
    end loop;
    select array_agg(a.attname::text order by a.attname::text) into before_other
      from pg_catalog.pg_attribute a where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped
      and not(a.attname=any(protected)) and pg_catalog.has_column_privilege(who,'public.users',a.attname,'SELECT');
    execute pg_catalog.format('revoke select (%s) on public.users from %I',
      (select string_agg(pg_catalog.quote_ident(name), ', ' order by name) from unnest(protected) name),who);
    select array_agg(a.attname::text order by a.attname::text) into after_other
      from pg_catalog.pg_attribute a where a.attrelid='public.users'::regclass and a.attnum>0 and not a.attisdropped
      and not(a.attname=any(protected)) and pg_catalog.has_column_privilege(who,'public.users',a.attname,'SELECT');
    if before_other is distinct from after_other or pg_catalog.has_column_privilege(who,'public.users','email','SELECT')
      then raise exception 'Other privilege changed for role %',who; end if;
    foreach item in array protected loop
      if pg_catalog.has_column_privilege(who,'public.users',item,'SELECT')
        or not pg_catalog.has_column_privilege('service_role','public.users',item,'SELECT')
      then raise exception 'Private user containment postcondition failed for %, %',who,item; end if;
    end loop;
  end loop;
end $$;
notify pgrst, 'reload schema';
