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
returns boolean language sql stable security definer set search_path = public, private as $$
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
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

grant select, update on public.group_conversations to authenticated;
grant select, update, delete on public.group_conversation_members to authenticated;
grant select, insert, update on public.group_messages to authenticated;

create or replace function public.create_group_conversation(conversation_name text, invited_user_ids uuid[])
returns uuid language plpgsql security definer set search_path = public, private as $$
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

create or replace function public.touch_group_conversation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  update public.group_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists touch_group_conversation_on_message on public.group_messages;
create trigger touch_group_conversation_on_message after insert on public.group_messages
for each row execute function public.touch_group_conversation();

do $$
begin
  alter publication supabase_realtime add table public.group_messages;
exception when duplicate_object then null;
end $$;
