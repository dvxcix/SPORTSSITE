-- Native routes verify the member and forum rollout before invoking either routine.
-- Existing browser policy, discussion records and notification delivery are retained.
create or replace function public.create_native_forum_reply(
  p_actor uuid, p_thread uuid, p_id uuid, p_parent uuid, p_content text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  thread_owner uuid;
  parent_owner uuid;
  locked boolean;
  previous public.forum_replies%rowtype;
begin
  if p_actor is null or p_thread is null or p_id is null or p_content is null
     or char_length(p_content) not between 1 and 5000 then
    return jsonb_build_object('status','invalid');
  end if;

  select author_id,is_locked into thread_owner,locked from public.forum_threads where id=p_thread for update;
  if not found then return jsonb_build_object('status','missing'); end if;

  select * into previous from public.forum_replies where id=p_id;
  if found then
    if previous.thread_id=p_thread and previous.author_id=p_actor and previous.content=p_content
       and previous.parent_reply_id is not distinct from p_parent and not coalesce(previous.is_deleted,false) then
      return jsonb_build_object('status','replay','id',p_id);
    end if;
    return jsonb_build_object('status','conflict');
  end if;

  if coalesce(locked,false) then return jsonb_build_object('status','locked'); end if;
  if p_parent is not null then
    select author_id into parent_owner from public.forum_replies
      where id=p_parent and thread_id=p_thread and not coalesce(is_deleted,false) for share;
    if not found then return jsonb_build_object('status','missing'); end if;
  end if;

  insert into public.forum_replies(id, thread_id, author_id, content, parent_reply_id)
    values(p_id,p_thread,p_actor,p_content,p_parent) on conflict (id) do nothing;
  if not found then return jsonb_build_object('status','conflict'); end if;

  return jsonb_build_object('status','created','id',p_id,'recipient',coalesce(parent_owner,thread_owner));
end;
$function$;
revoke all on function public.create_native_forum_reply(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_native_forum_reply(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.set_native_forum_reaction(
  p_actor uuid, p_thread uuid, p_target uuid, p_kind text, p_emoji text, p_enabled boolean
) returns jsonb
language plpgsql security invoker set search_path = ''
as $function$
declare
  owner uuid;
  opposite text;
  created boolean := false;
  added_rows bigint;
begin
  if p_actor is null or p_thread is null or p_target is null or p_enabled is null
     or p_kind is null or p_kind not in ('forum_thread','forum_reply')
     or p_emoji is null or p_emoji not in ('⬆️','⬇️','🔥','👍','💡','👀') then
    return jsonb_build_object('status','invalid');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'native-forum-reaction:'||p_actor::text||':'||p_target::text,0));
  perform 1 from public.forum_threads where id=p_thread for share;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p_kind='forum_thread' and p_target=p_thread then
    select author_id into owner from public.forum_threads where id=p_thread;
  elsif p_kind='forum_reply' then
    select author_id into owner from public.forum_replies where id=p_target and thread_id=p_thread for share;
  end if;
  if owner is null then return jsonb_build_object('status','missing'); end if;

  if p_enabled then
    if not exists(select 1 from public.reactions where user_id=p_actor and target_id=p_target and target_type=p_kind and emoji=p_emoji) then
      if not coalesce(private.check_rate_limit('reaction:'||p_actor::text,60,60),false) then
        return jsonb_build_object('status','limited');
      end if;
      insert into public.reactions(user_id,target_id,target_type,emoji) values(p_actor,p_target,p_kind,p_emoji) on conflict do nothing;
      get diagnostics added_rows = row_count;
      created := added_rows = 1;
    end if;
  else
    delete from public.reactions where user_id=p_actor and target_id=p_target and target_type=p_kind and emoji=p_emoji;
  end if;
  opposite := case p_emoji when '⬆️' then '⬇️' when '⬇️' then '⬆️' else null end;
  if opposite is not null then
    delete from public.reactions where user_id=p_actor and target_id=p_target and target_type=p_kind and emoji=opposite;
  end if;

  return jsonb_build_object('status','confirmed','added',created,'recipient',owner);
end;
$function$;
revoke all on function public.set_native_forum_reaction(uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.set_native_forum_reaction(uuid,uuid,uuid,text,text,boolean) to service_role;
