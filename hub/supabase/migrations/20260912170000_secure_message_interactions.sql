-- Durable message reactions/read state plus explicit message access checks.
-- Typing state remains ephemeral in Realtime Presence and is never stored.

create or replace function private.can_access_channel(target_channel_id uuid, viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select viewer_id is not null and exists (
    select 1
    from public.channels c
    where c.id = target_channel_id
      and (
        (c.channel_type = 'public' and c.creator_product_id is null)
        or c.owner_id = viewer_id
        or exists (
          select 1 from public.channel_members cm
          where cm.channel_id = c.id and cm.user_id = viewer_id
        )
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = c.group_id and gm.user_id = viewer_id
        )
        or exists (
          select 1 from public.creator_entitlements ce
          where ce.product_id = c.creator_product_id
            and ce.user_id = viewer_id
            and ce.status in ('active', 'trialing')
            and (ce.current_period_end is null or ce.current_period_end > now())
        )
      )
  );
$$;

create or replace function private.can_access_message(target_message_id uuid, viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select viewer_id is not null and exists (
    select 1
    from public.messages m
    where m.id = target_message_id
      and (
        (m.channel_id is null and viewer_id in (m.sender_id, m.dm_recipient_id))
        or (m.channel_id is not null and private.can_access_channel(m.channel_id, viewer_id))
      )
  );
$$;

revoke all on function private.can_access_channel(uuid, uuid) from public;
revoke all on function private.can_access_message(uuid, uuid) from public;
grant execute on function private.can_access_channel(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_message(uuid, uuid) to authenticated, service_role;

drop policy if exists "Channel messages to members" on public.messages;
create policy "Messages visible to participants"
  on public.messages for select
  using (private.can_access_message(id, (select auth.uid())));

drop policy if exists "Can send message" on public.messages;
create policy "Can send accessible message"
  on public.messages for insert
  with check (
    (select auth.uid()) = sender_id
    and private.check_rate_limit('message:' || sender_id::text, 60, 60)
    and (
      (
        channel_id is not null
        and dm_recipient_id is null
        and private.can_access_channel(channel_id, (select auth.uid()))
      )
      or (
        channel_id is null
        and dm_recipient_id is not null
        and dm_recipient_id <> (select auth.uid())
        and not exists (
          select 1 from public.blocks
          where (blocker_id = (select auth.uid()) and blocked_id = dm_recipient_id)
             or (blocker_id = dm_recipient_id and blocked_id = (select auth.uid()))
        )
      )
    )
  );

create table if not exists public.message_read_positions (
  user_id uuid not null references public.users(id) on delete cascade,
  context_type text not null check (context_type in ('channel', 'dm')),
  channel_id uuid references public.channels(id) on delete cascade,
  partner_id uuid references public.users(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz not null default now(),
  check (
    (context_type = 'channel' and channel_id is not null and partner_id is null)
    or (context_type = 'dm' and channel_id is null and partner_id is not null)
  )
);

-- Context-specific indexes preserve one cursor per user and conversation.
create unique index if not exists message_read_positions_channel_unique
  on public.message_read_positions (user_id, channel_id)
  where context_type = 'channel';
create unique index if not exists message_read_positions_dm_unique
  on public.message_read_positions (user_id, partner_id)
  where context_type = 'dm';
create index if not exists message_read_positions_last_message_idx
  on public.message_read_positions (last_read_message_id);

alter table public.message_read_positions enable row level security;
create policy "Members read relevant positions"
  on public.message_read_positions for select
  using (
    user_id = (select auth.uid())
    or (
      context_type = 'dm'
      and partner_id = (select auth.uid())
    )
  );
create policy "Members insert their position"
  on public.message_read_positions for insert
  with check (
    user_id = (select auth.uid())
    and (
      (context_type = 'channel' and private.can_access_channel(channel_id, (select auth.uid())))
      or (context_type = 'dm' and partner_id <> (select auth.uid()))
    )
  );
create policy "Members update their position"
  on public.message_read_positions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.message_read_positions to authenticated;

-- Reuse the existing polymorphic reactions table for messages, but keep
-- private-message reaction rows private to message participants.
drop policy if exists "Reactions public" on public.reactions;
create policy "Visible target reactions"
  on public.reactions for select
  using (
    target_type <> 'message'
    or private.can_access_message(target_id, (select auth.uid()))
  );

drop policy if exists "Can react" on public.reactions;
create policy "Can react to visible targets"
  on public.reactions for insert
  with check (
    (select auth.uid()) = user_id
    and private.check_rate_limit('reaction:' || user_id::text, 60, 60)
    and (
      target_type <> 'message'
      or private.can_access_message(target_id, (select auth.uid()))
    )
  );

create unique index if not exists reactions_user_target_emoji_unique
  on public.reactions (user_id, target_id, target_type, emoji);

create or replace function public.sync_message_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected_message_id uuid := coalesce(new.target_id, old.target_id);
  affected_target_type text := coalesce(new.target_type, old.target_type);
begin
  if affected_target_type = 'message' then
    update public.messages
    set reaction_count = (
      select count(*)::int from public.reactions
      where target_id = affected_message_id and target_type = 'message'
    )
    where id = affected_message_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reactions_sync_message_count on public.reactions;
create trigger reactions_sync_message_count
after insert or delete on public.reactions
for each row execute function public.sync_message_reaction_count();
