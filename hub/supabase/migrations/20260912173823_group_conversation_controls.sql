create table if not exists public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists group_message_reactions_message_idx
  on public.group_message_reactions (message_id, created_at);

alter table public.group_message_reactions enable row level security;

create policy "Members read group message reactions"
  on public.group_message_reactions for select using (
    exists (
      select 1 from public.group_messages message
      where message.id = message_id
        and private.is_group_conversation_member(message.conversation_id, (select auth.uid()))
    )
  );
create policy "Members add own group message reactions"
  on public.group_message_reactions for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.group_messages message
      where message.id = message_id and message.is_deleted = false
        and private.is_group_conversation_member(message.conversation_id, (select auth.uid()))
    )
    and private.check_rate_limit('group-reaction:' || user_id::text, 120, 60)
  );
create policy "Members remove own group message reactions"
  on public.group_message_reactions for delete using (user_id = (select auth.uid()));

grant select, insert, delete on public.group_message_reactions to authenticated;

create or replace function public.manage_group_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid,
  member_action text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor_id uuid := auth.uid();
  conversation_owner uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  select owner_id into conversation_owner from public.group_conversations where id = target_conversation_id;
  if conversation_owner is distinct from actor_id then raise exception 'owner access required'; end if;
  if target_user_id = actor_id then raise exception 'owner membership cannot change'; end if;
  if member_action not in ('add', 'remove') then raise exception 'invalid member action'; end if;
  if not private.check_rate_limit('group-member:' || actor_id::text, 40, 3600) then raise exception 'try again later'; end if;

  if member_action = 'remove' then
    delete from public.group_conversation_members
      where conversation_id = target_conversation_id and user_id = target_user_id and role = 'member';
    return;
  end if;

  if (select count(*) from public.group_conversation_members where conversation_id = target_conversation_id) >= 20 then
    raise exception 'conversation is full';
  end if;
  if not exists (select 1 from public.users where id = target_user_id and allow_dms = true) then
    raise exception 'member is unavailable';
  end if;
  if exists (
    select 1 from public.blocks block
    where (block.blocker_id = actor_id and block.blocked_id = target_user_id)
       or (block.blocker_id = target_user_id and block.blocked_id = actor_id)
  ) then raise exception 'member is unavailable'; end if;

  insert into public.group_conversation_members(conversation_id, user_id, role)
  values (target_conversation_id, target_user_id, 'member')
  on conflict do nothing;
end;
$$;

revoke all on function public.manage_group_conversation_member(uuid, uuid, text) from public, anon;
grant execute on function public.manage_group_conversation_member(uuid, uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.group_message_reactions;
exception when duplicate_object then null;
end $$;
