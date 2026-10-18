-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$ begin
 if to_regclass('public.group_conversations') is not null then raise exception 'Repair precondition failed: group_conversations already exists; reconcile schema first'; end if;
 if to_regclass('public.group_conversation_members') is not null then raise exception 'Repair precondition failed: group_conversation_members already exists; reconcile schema first'; end if;
 if to_regclass('public.group_messages') is not null then raise exception 'Repair precondition failed: group_messages already exists; reconcile schema first'; end if;
 if to_regclass('public.group_message_reactions') is not null then raise exception 'Repair precondition failed: group_message_reactions already exists; reconcile schema first'; end if;
end $guard$;
create table if not exists public.group_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 64),
  avatar_url text null check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_conversation_members (
  conversation_id uuid not null references public.group_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  muted boolean not null default false,
  last_read_at timestamptz null,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.group_conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 1000),
  media_urls text[] not null default '{}',
  reply_to_id uuid null references public.group_messages(id) on delete set null,
  edited_at timestamptz null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_deleted or char_length(btrim(content)) > 0 or cardinality(media_urls) > 0)
);

create index if not exists group_conversation_members_user_idx on public.group_conversation_members (user_id, joined_at desc);
create index if not exists group_messages_conversation_recent_idx on public.group_messages (conversation_id, created_at desc);

alter table public.group_conversations enable row level security;
alter table public.group_conversation_members enable row level security;
alter table public.group_messages enable row level security;

create or replace function private.is_group_conversation_member(target_conversation uuid, target_user uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, private as $$
  select exists (
    select 1 from public.group_conversation_members member
    where member.conversation_id = target_conversation and member.user_id = target_user
  );
$$;
revoke all on function private.is_group_conversation_member(uuid, uuid) from public;
grant execute on function private.is_group_conversation_member(uuid, uuid) to authenticated;

create policy "Members read joined group conversations" on public.group_conversations for select
  using (private.is_group_conversation_member(id, (select auth.uid())));
create policy "Owners update group conversations" on public.group_conversations for update
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Members read group participants" on public.group_conversation_members for select
  using (private.is_group_conversation_member(conversation_id, (select auth.uid())));
create policy "Members update own group preferences" on public.group_conversation_members for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members leave group conversations" on public.group_conversation_members for delete
  using (user_id = (select auth.uid()) and role <> 'owner');

create policy "Members read group messages" on public.group_messages for select
  using (private.is_group_conversation_member(conversation_id, (select auth.uid())));
create policy "Members send group messages" on public.group_messages for insert
  with check (
    sender_id = (select auth.uid())
    and private.is_group_conversation_member(conversation_id, (select auth.uid()))
    and private.check_rate_limit('group-message:' || sender_id::text, 60, 60)
  );
create policy "Authors update group messages" on public.group_messages for update
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()) and private.is_group_conversation_member(conversation_id, (select auth.uid())));

revoke all on public.group_conversations from public, anon, authenticated;
grant select on public.group_conversations to authenticated;
grant update(name, avatar_url) on public.group_conversations to authenticated;
revoke all on public.group_conversation_members from public, anon, authenticated;
grant select, delete on public.group_conversation_members to authenticated;
grant update(muted, last_read_at) on public.group_conversation_members to authenticated;
revoke all on public.group_messages from public, anon, authenticated;
grant select, insert on public.group_messages to authenticated;
grant update(content, media_urls, edited_at, is_deleted) on public.group_messages to authenticated;

create or replace function public.create_group_conversation(conversation_name text, invited_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare
  actor_id uuid := auth.uid();
  clean_ids uuid[];
  new_id uuid;
begin
  if actor_id is null then raise exception 'authentication required'; end if;
  if char_length(btrim(coalesce(conversation_name, ''))) not between 1 and 64 then raise exception 'invalid conversation name'; end if;
  select coalesce(array_agg(distinct candidate), '{}') into clean_ids
  from unnest(coalesce(invited_user_ids, '{}')) candidate where candidate <> actor_id;
  if cardinality(clean_ids) < 2 or cardinality(clean_ids) > 19 then raise exception 'select between 2 and 19 members'; end if;
  if exists (
    select 1 from unnest(clean_ids) candidate
    left join public.users member on member.id = candidate
    where member.id is null or member.allow_dms is not true
      or exists (select 1 from public.blocks block where (block.blocker_id = actor_id and block.blocked_id = candidate) or (block.blocker_id = candidate and block.blocked_id = actor_id))
  ) then raise exception 'one or more members are unavailable'; end if;
  if not private.check_rate_limit('group-create:' || actor_id::text, 5, 3600) then raise exception 'try again later'; end if;

  insert into public.group_conversations(owner_id, name) values (actor_id, btrim(conversation_name)) returning id into new_id;
  insert into public.group_conversation_members(conversation_id, user_id, role) values (new_id, actor_id, 'owner');
  insert into public.group_conversation_members(conversation_id, user_id, role)
    select new_id, candidate, 'member' from unnest(clean_ids) candidate;
  return new_id;
end;
$$;
revoke all on function public.create_group_conversation(text, uuid[]) from public;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

create or replace function private.touch_group_conversation()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.group_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists touch_group_conversation_on_message on public.group_messages;
create trigger touch_group_conversation_on_message after insert on public.group_messages
for each row execute function private.touch_group_conversation();

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;

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

revoke all on public.group_message_reactions from public, anon, authenticated;
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
  select owner_id into conversation_owner from public.group_conversations where id = target_conversation_id for update;
  if conversation_owner is distinct from actor_id then raise exception 'owner access required'; end if;
  if target_user_id = actor_id then raise exception 'owner membership cannot change'; end if;
  if member_action is null or member_action not in ('add', 'remove') then raise exception 'invalid member action'; end if;
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

revoke all on function private.touch_group_conversation() from public, anon, authenticated;

alter table public.group_messages add constraint group_message_id_conversation_unique unique(id,conversation_id);
alter table public.group_messages add constraint group_message_reply_conversation_fk foreign key(reply_to_id,conversation_id) references public.group_messages(id,conversation_id);

grant all on table public.group_conversations to service_role;
grant all on table public.group_conversation_members to service_role;
grant all on table public.group_messages to service_role;
grant all on table public.group_message_reactions to service_role;
commit;
