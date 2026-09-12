alter table public.messages
  add column if not exists forwarded_from_id uuid references public.messages(id) on delete set null;

create index if not exists idx_messages_forwarded_from_id
  on public.messages(forwarded_from_id)
  where forwarded_from_id is not null;

create or replace function public.forward_direct_message(source_message_id uuid, recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  source_message public.messages%rowtype;
  created_id uuid;
begin
  if actor_id is null or recipient_id is null or actor_id = recipient_id then
    raise exception 'invalid forward target';
  end if;

  select * into source_message from public.messages where id = source_message_id and coalesce(is_deleted, false) = false;
  if not found then raise exception 'message unavailable'; end if;

  if source_message.sender_id <> actor_id
    and source_message.dm_recipient_id <> actor_id
    and not (source_message.channel_id is not null and exists (
      select 1 from public.channel_members cm where cm.channel_id = source_message.channel_id and cm.user_id = actor_id
    )) then
    raise exception 'message unavailable';
  end if;

  if exists (select 1 from public.blocks b where (b.blocker_id = actor_id and b.blocked_id = recipient_id) or (b.blocker_id = recipient_id and b.blocked_id = actor_id)) then
    raise exception 'message unavailable';
  end if;

  insert into public.messages(sender_id, dm_recipient_id, content, media_urls, message_type, pick_data, forwarded_from_id)
  values (actor_id, recipient_id, source_message.content, coalesce(source_message.media_urls, '{}'::text[]), source_message.message_type, source_message.pick_data, source_message.id)
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.forward_direct_message(uuid, uuid) from public, anon;
grant execute on function public.forward_direct_message(uuid, uuid) to authenticated;
