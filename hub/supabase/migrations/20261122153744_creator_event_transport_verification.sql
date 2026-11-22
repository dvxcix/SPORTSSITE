-- Persist the outcome of the provider-generated signed delivery check.
-- Technical creator webhook configuration only; no financial accounts, memberships, grants or keys change.
set lock_timeout='3s';
set statement_timeout='15s';
do $$ begin
 if to_regclass('public.creator_provider_connections') is null
 or not (select relrowsecurity from pg_class where oid='public.creator_provider_connections'::regclass)
 or has_table_privilege('anon','public.creator_provider_connections','select')
 or has_table_privilege('authenticated','public.creator_provider_connections','select')
 or exists(select 1 from information_schema.columns where table_schema='public' and table_name='creator_provider_connections' and column_name in('delivery_verified_at','last_test_status'))
 then raise exception 'Creator connection verification baseline changed'; end if;
end $$;
alter table public.creator_provider_connections add column delivery_verified_at timestamptz,add column last_test_status integer;
notify pgrst,'reload schema';
