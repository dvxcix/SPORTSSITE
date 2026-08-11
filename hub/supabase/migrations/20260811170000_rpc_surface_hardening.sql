-- Keep policy helpers out of PostgREST's exposed public RPC namespace.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.check_rate_limit(text, integer, integer) set schema private;
alter function public.is_group_member(uuid, uuid) set schema private;

revoke all on function private.check_rate_limit(text, integer, integer) from public, anon;
revoke all on function private.is_group_member(uuid, uuid) from public, anon;
grant execute on function private.check_rate_limit(text, integer, integer) to authenticated, service_role;
grant execute on function private.is_group_member(uuid, uuid) to authenticated, service_role;

-- A reaction notification must describe a real reaction by the current user
-- to the target user's own post. The old parameter-only checks prevented actor
-- spoofing but still allowed a signed-in caller to notify an arbitrary user.
create or replace function public.notify_reaction(
  p_user_id uuid,
  p_actor_id uuid,
  p_post_id uuid,
  p_emoji text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_post_owner uuid;
  v_existing_id uuid;
  v_existing_data jsonb;
  v_username text;
  v_display_name text;
  v_avatar_url text;
  v_actor_snapshot jsonb;
  v_prev_actors jsonb;
  v_new_actors jsonb;
  v_new_count int;
  v_message text;
begin
  if p_user_id is null or p_actor_id is distinct from auth.uid()
     or p_user_id = p_actor_id or p_emoji is null
     or length(p_emoji) < 1 or length(p_emoji) > 32 then
    return;
  end if;

  select user_id into v_post_owner from public.posts where id = p_post_id;
  if v_post_owner is distinct from p_user_id or not exists (
    select 1 from public.reactions
    where user_id = p_actor_id and target_id = p_post_id
      and target_type = 'post' and emoji = p_emoji
  ) then
    return;
  end if;

  select username, display_name, avatar_url into v_username, v_display_name, v_avatar_url
  from public.users where id = p_actor_id;

  v_actor_snapshot := jsonb_build_object(
    'id', p_actor_id, 'username', v_username,
    'display_name', v_display_name, 'avatar_url', v_avatar_url
  );

  select id, data into v_existing_id, v_existing_data
  from public.notifications
  where user_id = p_user_id and type = 'reaction' and target_id = p_post_id
    and read = false and data->>'emoji' = p_emoji
  order by created_at desc
  limit 1;

  if v_existing_id is not null then
    v_prev_actors := coalesce(v_existing_data->'actors', '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(v_prev_actors) elem where elem->>'id' = p_actor_id::text) then
      return;
    end if;
    v_new_actors := jsonb_build_array(v_actor_snapshot) || v_prev_actors;
    v_new_count := coalesce((v_existing_data->>'count')::int, jsonb_array_length(v_prev_actors)) + 1;
    if jsonb_array_length(v_new_actors) > 5 then
      select jsonb_agg(e) into v_new_actors
      from (select e from jsonb_array_elements(v_new_actors) e limit 5) s;
    end if;
    v_message := case when v_new_count > 1
      then 'and ' || (v_new_count - 1) || ' other' || (case when v_new_count > 2 then 's' else '' end) || ' reacted ' || p_emoji || ' to your post'
      else 'reacted ' || p_emoji || ' to your post'
    end;

    update public.notifications
    set actor_id = p_actor_id,
        data = jsonb_build_object('emoji', p_emoji, 'actors', v_new_actors, 'count', v_new_count),
        message = v_message,
        created_at = now(),
        read = false
    where id = v_existing_id;
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, message, link, target_id, target_type, data)
  values (
    p_user_id, p_actor_id, 'reaction', 'reacted ' || p_emoji || ' to your post',
    '/posts/' || p_post_id, p_post_id, 'post',
    jsonb_build_object('emoji', p_emoji, 'actors', jsonb_build_array(v_actor_snapshot), 'count', 1)
  );
end;
$$;

revoke all on function public.notify_reaction(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.notify_reaction(uuid, uuid, uuid, text) to authenticated, service_role;

alter function public.record_matrix_marketplace_copy() set search_path = pg_catalog, public;
revoke all on function public.record_matrix_marketplace_copy() from public, anon, authenticated;
grant execute on function public.record_matrix_marketplace_copy() to service_role;
