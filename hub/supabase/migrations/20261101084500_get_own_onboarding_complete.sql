-- Candidate only. Deploy after guarded role/identity and gateway testing.
-- Returns only the current JWT subject's completion state; missing profile
-- means incomplete, as in the existing middleware gate.
do $$ begin
  perform pg_catalog.set_config('lock_timeout','3s',true);
  perform pg_catalog.set_config('statement_timeout','30s',true);
  if pg_catalog.to_regprocedure('public.get_own_onboarding_complete()') is not null
    or pg_catalog.to_regprocedure('auth.uid()') is null
    or pg_catalog.to_regclass('public.users') is null
    or not exists (select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls))
    or not exists (select 1 from pg_catalog.pg_attribute where attrelid='public.users'::regclass and attname='onboarding_completed_at' and atttypid='timestamptz'::regtype and not attisdropped)
    or not exists (select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid='public.users'::regclass and i.indisprimary and i.indisvalid and i.indisready and i.indnkeyatts=1 and i.indpred is null and am.amname='btree' and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='id')
  then raise exception 'Own onboarding preflight failed'; end if;
end $$;
create function public.get_own_onboarding_complete()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce((select u.onboarding_completed_at is not null from public.users u where u.id = auth.uid()), false)
$$;
revoke all on function public.get_own_onboarding_complete() from public, anon, authenticated;
grant execute on function public.get_own_onboarding_complete() to authenticated;

notify pgrst, 'reload schema';
