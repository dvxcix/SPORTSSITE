-- Service-only atomic preference merge. Callers must authenticate and bind
-- p_user_id before using this function; no browser role may execute it.
-- It returns only whether the stored row matched the supplied baseline.
do $$
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);
  if pg_catalog.to_regclass('public.users') is null
    or pg_catalog.to_regprocedure('public.save_account_preferences(uuid,text,jsonb,jsonb)') is not null
    or (select count(*) from pg_catalog.pg_attribute where attrelid = 'public.users'::regclass and attname in ('interest_settings','notification_settings','notification_delivery_settings','dugout_column_prefs') and atttypid = 'jsonb'::regtype and not attisdropped) <> 4
    or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role' and rolbypassrls)
    or not pg_catalog.has_table_privilege('service_role','public.users','SELECT')
    or not pg_catalog.has_table_privilege('service_role','public.users','UPDATE')
  then raise exception 'Preference function preflight failed'; end if;
end $$;

create function public.save_account_preferences(
  p_user_id uuid,
  p_kind text,
  p_changes jsonb,
  p_expected jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  fields text[];
  field_name text;
  changed boolean := false;
begin
  if p_user_id is null or p_kind is null or p_kind not in ('interests', 'notifications', 'dugout-columns')
    or pg_catalog.jsonb_typeof(p_changes) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_expected) is distinct from 'object'
    or pg_catalog.octet_length(p_changes::text) > 16384
    or pg_catalog.octet_length(p_expected::text) > 16384
  then raise exception 'Invalid preference request'; end if;

  fields := case p_kind
    when 'interests' then array['interest_settings']
    when 'notifications' then array['notification_settings', 'notification_delivery_settings']
    else array['dugout_column_prefs'] end;
  if exists (select 1 from pg_catalog.jsonb_object_keys(p_changes) key where not (key = any(fields)))
    or exists (select 1 from pg_catalog.jsonb_object_keys(p_expected) key where not (key = any(fields)))
  then raise exception 'Invalid preference fields'; end if;
  foreach field_name in array fields loop
    if not (p_changes ? field_name) or not (p_expected ? field_name)
      or pg_catalog.jsonb_typeof(p_changes -> field_name) is distinct from 'object'
    then raise exception 'Invalid preference fields'; end if;
  end loop;

  if p_kind = 'interests' then
    if exists (select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'interest_settings') key where key not in ('content_mix', 'market_focus', 'discovery_mode')) then raise exception 'Invalid interest fields'; end if;
    with updated as (
      update public.users u
      set interest_settings = (case when pg_catalog.jsonb_typeof(u.interest_settings) = 'object' then u.interest_settings else '{}'::jsonb end) || (p_changes -> 'interest_settings')
      where u.id = p_user_id
      and (u.interest_settings is null or pg_catalog.jsonb_typeof(u.interest_settings) in ('object','null'))
      and not exists (
        select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'interest_settings') key
        where ((case when pg_catalog.jsonb_typeof(u.interest_settings) = 'object' then u.interest_settings else '{}'::jsonb end) -> key)
          is distinct from ((case when pg_catalog.jsonb_typeof(p_expected -> 'interest_settings') = 'object' then p_expected -> 'interest_settings' else '{}'::jsonb end) -> key)
      ) returning 1
    ) select exists (select 1 from updated) into changed;
  elsif p_kind = 'notifications' then
    if exists (select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'notification_settings') key where key not in ('new_follower','new_follower_email','post_reaction','post_reaction_email','post_comment','post_comment_email','repost','repost_email','mention','mention_email','new_pick','new_pick_email','pick_result','pick_result_email','group_invite','group_invite_email','dm','dm_email','subscription','subscription_email','lineup_confirmed','lineup_confirmed_email'))
      or exists (select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'notification_delivery_settings') key where key not in ('quiet_hours_enabled','quiet_start','quiet_end','timezone','live_game_priority'))
    then raise exception 'Invalid notification fields'; end if;
    with updated as (
      update public.users u
      set notification_settings = (case when pg_catalog.jsonb_typeof(u.notification_settings) = 'object' then u.notification_settings else '{}'::jsonb end) || (p_changes -> 'notification_settings'),
          notification_delivery_settings = (case when pg_catalog.jsonb_typeof(u.notification_delivery_settings) = 'object' then u.notification_delivery_settings else '{}'::jsonb end) || (p_changes -> 'notification_delivery_settings')
      where u.id = p_user_id
      and (u.notification_settings is null or pg_catalog.jsonb_typeof(u.notification_settings) in ('object','null'))
      and (u.notification_delivery_settings is null or pg_catalog.jsonb_typeof(u.notification_delivery_settings) in ('object','null'))
      and not exists (
        select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'notification_settings') key
        where ((case when pg_catalog.jsonb_typeof(u.notification_settings) = 'object' then u.notification_settings else '{}'::jsonb end) -> key)
          is distinct from ((case when pg_catalog.jsonb_typeof(p_expected -> 'notification_settings') = 'object' then p_expected -> 'notification_settings' else '{}'::jsonb end) -> key)
      ) and not exists (
        select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'notification_delivery_settings') key
        where ((case when pg_catalog.jsonb_typeof(u.notification_delivery_settings) = 'object' then u.notification_delivery_settings else '{}'::jsonb end) -> key)
          is distinct from ((case when pg_catalog.jsonb_typeof(p_expected -> 'notification_delivery_settings') = 'object' then p_expected -> 'notification_delivery_settings' else '{}'::jsonb end) -> key)
      ) returning 1
    ) select exists (select 1 from updated) into changed;
  else
    if exists (select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'dugout_column_prefs') key where key not in ('hiddenGroups', 'hiddenColumns', 'columnOrder')) then raise exception 'Invalid column fields'; end if;
    with updated as (
      update public.users u
      set dugout_column_prefs = (case when pg_catalog.jsonb_typeof(u.dugout_column_prefs) = 'object' then u.dugout_column_prefs else '{}'::jsonb end) || (p_changes -> 'dugout_column_prefs')
      where u.id = p_user_id
      and (u.dugout_column_prefs is null or pg_catalog.jsonb_typeof(u.dugout_column_prefs) in ('object','null'))
      and not exists (
        select 1 from pg_catalog.jsonb_object_keys(p_changes -> 'dugout_column_prefs') key
        where ((case when pg_catalog.jsonb_typeof(u.dugout_column_prefs) = 'object' then u.dugout_column_prefs else '{}'::jsonb end) -> key)
          is distinct from ((case when pg_catalog.jsonb_typeof(p_expected -> 'dugout_column_prefs') = 'object' then p_expected -> 'dugout_column_prefs' else '{}'::jsonb end) -> key)
      ) returning 1
    ) select exists (select 1 from updated) into changed;
  end if;
  return changed;
end $$;

revoke all on function public.save_account_preferences(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_account_preferences(uuid,text,jsonb,jsonb) to service_role;
do $$
begin
  if pg_catalog.has_function_privilege('anon', 'public.save_account_preferences(uuid,text,jsonb,jsonb)', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.save_account_preferences(uuid,text,jsonb,jsonb)', 'execute')
    or not pg_catalog.has_function_privilege('service_role', 'public.save_account_preferences(uuid,text,jsonb,jsonb)', 'execute')
  then raise exception 'Preference function grants are unsafe'; end if;
end $$;
