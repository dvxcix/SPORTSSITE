create or replace function public.moderate_channel_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_channel_id uuid;
  v_sender_id uuid;
  v_group_id uuid;
  v_channel_owner uuid;
  v_role text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;

  select m.channel_id, m.sender_id, c.group_id, c.owner_id
    into v_channel_id, v_sender_id, v_group_id, v_channel_owner
  from public.messages m
  join public.channels c on c.id = m.channel_id
  where m.id = p_message_id
  for update of m;

  if v_channel_id is null then raise exception 'Channel message not found'; end if;

  if v_sender_id <> v_actor and v_channel_owner <> v_actor then
    select gm.role into v_role
    from public.group_members gm
    where gm.group_id = v_group_id and gm.user_id = v_actor;
    if v_role is null or v_role not in ('owner', 'admin', 'moderator') then
      raise exception 'Moderator access required';
    end if;
  end if;

  update public.messages
  set content = '', media_urls = '{}'::text[], is_deleted = true, edited_at = now()
  where id = p_message_id and channel_id = v_channel_id;

  insert into public.admin_audit_logs(actor_user_id, action, target_type, target_id, details)
  values (
    v_actor,
    case when v_sender_id = v_actor then 'message.delete' else 'message.moderate' end,
    'message',
    p_message_id::text,
    jsonb_build_object('channel_id', v_channel_id, 'sender_id', v_sender_id, 'group_id', v_group_id)
  );
  return true;
end;
$$;

revoke all on function public.moderate_channel_message(uuid) from public, anon;
grant execute on function public.moderate_channel_message(uuid) to authenticated;
