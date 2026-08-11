-- Move atomic social transactions behind authenticated application routes.
-- PostgREST clients can no longer execute security-definer social RPCs.

create or replace function public.cast_poll_vote_server(
  p_post_id uuid,
  p_user_id uuid,
  p_option_index integer
) returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_poll_data jsonb;
  v_options jsonb;
  v_new_options jsonb := '[]'::jsonb;
  v_opt jsonb;
  v_i int;
  v_ends_at timestamptz;
  v_final_vote int;
begin
  if p_user_id is null then raise exception 'missing user'; end if;

  select poll_data into v_poll_data from public.posts where id = p_post_id for update;
  if v_poll_data is null then raise exception 'no poll on this post'; end if;

  v_ends_at := nullif(v_poll_data->>'ends_at', '')::timestamptz;
  if v_ends_at is not null and v_ends_at < now() then raise exception 'poll has ended'; end if;

  v_options := v_poll_data -> 'options';
  if p_option_index < 0 or p_option_index >= jsonb_array_length(v_options) then
    raise exception 'invalid option';
  end if;

  insert into public.post_poll_votes (post_id, user_id, option_index)
  values (p_post_id, p_user_id, p_option_index)
  on conflict (post_id, user_id) do nothing;

  for v_i in 0..jsonb_array_length(v_options) - 1 loop
    v_opt := v_options -> v_i;
    v_opt := jsonb_set(v_opt, '{votes}', to_jsonb(
      (select count(*)::int from public.post_poll_votes where post_id = p_post_id and option_index = v_i)
    ));
    v_new_options := v_new_options || jsonb_build_array(v_opt);
  end loop;

  update public.posts set poll_data = jsonb_set(v_poll_data, '{options}', v_new_options) where id = p_post_id;
  select option_index into v_final_vote from public.post_poll_votes where post_id = p_post_id and user_id = p_user_id;
  return v_final_vote;
end;
$$;

create or replace function public.notify_reaction_server(
  p_actor_id uuid,
  p_post_id uuid,
  p_emoji text
) returns void
language plpgsql
security invoker
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
  if p_actor_id is null or p_emoji is null or length(p_emoji) < 1 or length(p_emoji) > 32 then return; end if;

  select user_id into v_post_owner from public.posts where id = p_post_id;
  if v_post_owner is null or v_post_owner = p_actor_id or not exists (
    select 1 from public.reactions
    where user_id = p_actor_id and target_id = p_post_id
      and target_type = 'post' and emoji = p_emoji
  ) then return; end if;

  select username, display_name, avatar_url into v_username, v_display_name, v_avatar_url
  from public.users where id = p_actor_id;

  v_actor_snapshot := jsonb_build_object(
    'id', p_actor_id, 'username', v_username,
    'display_name', v_display_name, 'avatar_url', v_avatar_url
  );

  select id, data into v_existing_id, v_existing_data
  from public.notifications
  where user_id = v_post_owner and type = 'reaction' and target_id = p_post_id
    and read = false and data->>'emoji' = p_emoji
  order by created_at desc limit 1;

  if v_existing_id is not null then
    v_prev_actors := coalesce(v_existing_data->'actors', '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(v_prev_actors) elem where elem->>'id' = p_actor_id::text) then return; end if;
    v_new_actors := jsonb_build_array(v_actor_snapshot) || v_prev_actors;
    v_new_count := coalesce((v_existing_data->>'count')::int, jsonb_array_length(v_prev_actors)) + 1;
    if jsonb_array_length(v_new_actors) > 5 then
      select jsonb_agg(e) into v_new_actors from (select e from jsonb_array_elements(v_new_actors) e limit 5) s;
    end if;
    v_message := case when v_new_count > 1
      then 'and ' || (v_new_count - 1) || ' other' || (case when v_new_count > 2 then 's' else '' end) || ' reacted ' || p_emoji || ' to your post'
      else 'reacted ' || p_emoji || ' to your post' end;

    update public.notifications
    set actor_id = p_actor_id,
        data = jsonb_build_object('emoji', p_emoji, 'actors', v_new_actors, 'count', v_new_count),
        message = v_message, created_at = now(), read = false
    where id = v_existing_id;
    return;
  end if;

  insert into public.notifications (user_id, actor_id, type, message, link, target_id, target_type, data)
  values (
    v_post_owner, p_actor_id, 'reaction', 'reacted ' || p_emoji || ' to your post',
    '/posts/' || p_post_id, p_post_id, 'post',
    jsonb_build_object('emoji', p_emoji, 'actors', jsonb_build_array(v_actor_snapshot), 'count', 1)
  );
end;
$$;

revoke all on function public.cast_poll_vote_server(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.notify_reaction_server(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cast_poll_vote_server(uuid, uuid, integer) to service_role;
grant execute on function public.notify_reaction_server(uuid, uuid, text) to service_role;

revoke all on function public.cast_poll_vote(uuid, integer) from public, anon, authenticated;
revoke all on function public.notify_reaction(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cast_poll_vote(uuid, integer) to service_role;
grant execute on function public.notify_reaction(uuid, uuid, uuid, text) to service_role;
