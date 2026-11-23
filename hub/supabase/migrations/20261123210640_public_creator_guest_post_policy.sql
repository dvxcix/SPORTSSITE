-- PostgreSQL checks function EXECUTE permission while preparing an RLS rule,
-- including unreachable CASE branches. Guests must not call membership helpers.
-- Keep the existing authenticated expression exactly; give anon its original
-- CASE branch as a separate restrictive policy. No data or grants change.
do $preflight$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='posts'
      and policyname='Community posts require current group access'
      and permissive='RESTRICTIVE' and cmd='SELECT'
      and roles=array['anon','authenticated']::name[]
      and md5(qual)='e16fed290d16f99191a0538d93f6c483'
  ) then
    raise exception 'Guest post policy preflight changed; review before applying';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='posts' and policyname='Guests read non-community posts') then
    raise exception 'Guest post repair already present; do not replay';
  end if;
  if has_function_privilege('anon','private.can_view_group(uuid,uuid)','execute')
    or has_function_privilege('anon','private.is_group_member(uuid,uuid)','execute') then
    raise exception 'Private helper permissions changed; review before applying';
  end if;
end
$preflight$;

alter policy "Community posts require current group access" on public.posts to authenticated;
create policy "Guests read non-community posts" on public.posts
  as restrictive for select to anon using (group_id is null);

do $verify$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='posts'
    and policyname='Community posts require current group access'
    and roles=array['authenticated']::name[] and md5(qual)='e16fed290d16f99191a0538d93f6c483') then
    raise exception 'Authenticated post predicate must remain unchanged';
  end if;
end
$verify$;
