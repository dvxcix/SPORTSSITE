-- Applied to primary as 20261031155149 for the 2026-27 offseason. Do not replay.
-- This protects sport-tagged social rows;
-- it does not redact user profile columns or cover SECURITY DEFINER RPCs.
do $$
declare
  item record;
  target oid;
  predicate text;
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);

  if not pg_catalog.has_column_privilege('anon', 'public.users', 'id', 'SELECT')
     or not pg_catalog.has_column_privilege('anon', 'public.users', 'account_type', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.users', 'id', 'SELECT')
     or not pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'SELECT')
     or pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'UPDATE')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_type', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.users', 'account_type', 'INSERT')
     or pg_catalog.has_column_privilege('anon', 'public.users', 'account_type', 'INSERT')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role' and rolbypassrls)
  then raise exception 'MLB mixed off-season preflight: admin grants changed'; end if;

  for item in select * from (values
    ('posts', true), ('picks', false), ('stories', true),
    ('game_room_messages', false), ('groups', false),
    ('watchlist_items', false), ('research_notes', false),
    ('creator_scheduled_posts', false)
  ) as entries(table_name, has_pick_data) loop
    target := pg_catalog.to_regclass(pg_catalog.format('public.%I', item.table_name));
    if target is null or not exists (
      select 1 from pg_catalog.pg_class where oid = target and relkind = 'r' and relrowsecurity
    ) or not exists (
      select 1 from pg_catalog.pg_attribute where attrelid = target and attname = 'sport'
        and atttypid = 'text'::regtype and not attisdropped
    ) or (item.has_pick_data and not exists (
      select 1 from pg_catalog.pg_attribute where attrelid = target and attname = 'pick_data'
        and atttypid = 'jsonb'::regtype and not attisdropped
    )) or not pg_catalog.has_table_privilege('anon', target, 'SELECT')
      or not pg_catalog.has_table_privilege('authenticated', target, 'SELECT')
      or not pg_catalog.has_table_privilege('service_role', target, 'SELECT')
      or not exists (select 1 from pg_catalog.pg_policy where polrelid = target and polcmd in ('r', '*') and polpermissive)
      or exists (select 1 from pg_catalog.pg_policy where polrelid = target and polname = 'mlb_offseason_mixed_read')
    then raise exception 'MLB mixed off-season preflight: schema or policies changed for %', item.table_name; end if;

    predicate := '(lower(btrim(coalesce(sport, ''''))) <> ''mlb'')';
    if item.has_pick_data then
      -- Current single-pick sport is at the root; parlay sports are per leg.
      -- Non-array/missing legs are not treated as evidence of an MLB leg.
      predicate := predicate || $json$ and not coalesce(jsonb_path_exists(pick_data,
        '$.sport ? (@ like_regex "^[[:space:]]*mlb[[:space:]]*$" flag "i")'), false)
        and not coalesce(jsonb_path_exists(pick_data,
        '$.legs[*].sport ? (@ like_regex "^[[:space:]]*mlb[[:space:]]*$" flag "i")'), false)$json$;
    end if;
    execute pg_catalog.format(
      'create policy mlb_offseason_mixed_read on public.%I as restrictive for select to anon, authenticated using ((%s) or (select exists (select 1 from public.users where id = (select auth.uid()) and account_type = ''admin'')))',
      item.table_name, predicate
    );
  end loop;
end $$;
