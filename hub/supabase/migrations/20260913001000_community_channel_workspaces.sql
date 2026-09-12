alter table public.channels
  add column if not exists channel_kind text not null default 'text'
    check (channel_kind in ('text', 'live', 'picks', 'announcements')),
  add column if not exists topic text
    check (topic is null or char_length(topic) <= 180),
  add column if not exists sort_order integer not null default 0;

create index if not exists idx_channels_group_sort
  on public.channels(group_id, sort_order, created_at)
  where group_id is not null;

create or replace function private.can_manage_group_channels(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.groups community
      where community.id = p_group_id
        and (
          community.owner_id = p_user_id
          or exists (
            select 1 from public.group_members membership
            where membership.group_id = community.id
              and membership.user_id = p_user_id
              and membership.role in ('owner', 'admin')
          )
        )
    );
$$;

revoke all on function private.can_manage_group_channels(uuid, uuid) from public, anon;
grant execute on function private.can_manage_group_channels(uuid, uuid) to authenticated, service_role;

create or replace function private.can_post_channel(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.can_access_channel(p_channel_id, p_user_id)
    and exists (
      select 1 from public.channels channel
      where channel.id = p_channel_id
        and (
          channel.channel_kind <> 'announcements'
          or channel.owner_id = p_user_id
          or exists (
            select 1 from public.group_members membership
            where membership.group_id = channel.group_id
              and membership.user_id = p_user_id
              and membership.role in ('owner', 'admin', 'moderator')
          )
        )
    );
$$;

revoke all on function private.can_post_channel(uuid, uuid) from public, anon;
grant execute on function private.can_post_channel(uuid, uuid) to authenticated, service_role;

create or replace function public.create_group_channel(
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_icon text default '#',
  p_channel_kind text default 'text'
)
returns public.channels
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_group public.groups%rowtype;
  v_base_slug text;
  v_slug text;
  v_channel public.channels;
  v_sort_order integer;
begin
  if not private.can_manage_group_channels(p_group_id, v_actor) then
    raise exception using errcode = '42501', message = 'Channel management access required';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 48 then
    raise exception using errcode = '22023', message = 'Channel name must be between 2 and 48 characters';
  end if;
  if p_description is not null and char_length(btrim(p_description)) > 180 then
    raise exception using errcode = '22023', message = 'Channel description is too long';
  end if;
  if p_icon is not null and char_length(p_icon) > 16 then
    raise exception using errcode = '22023', message = 'Channel icon is too long';
  end if;
  if p_channel_kind not in ('text', 'live', 'picks', 'announcements') then
    raise exception using errcode = '22023', message = 'Invalid channel type';
  end if;

  select * into v_group from public.groups where id = p_group_id;
  if not found then raise exception using errcode = 'P0002', message = 'Community not found'; end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then v_base_slug := 'room'; end if;
  v_slug := 'group-' || left(replace(p_group_id::text, '-', ''), 8) || '-' || left(v_base_slug, 46);
  if exists (select 1 from public.channels where slug = v_slug) then
    v_slug := left(v_slug, 62) || '-' || left(replace(gen_random_uuid()::text, '-', ''), 7);
  end if;

  select coalesce(max(channel.sort_order), 0) + 10 into v_sort_order
  from public.channels channel where channel.group_id = p_group_id;

  insert into public.channels (
    name, slug, description, icon, channel_type, channel_kind, topic,
    owner_id, member_count, group_id, creator_product_id, sort_order
  ) values (
    btrim(p_name), v_slug, nullif(btrim(p_description), ''), coalesce(nullif(p_icon, ''), '#'),
    case when v_group.is_public then 'public' else 'members_only' end,
    p_channel_kind, nullif(btrim(p_description), ''), v_group.owner_id,
    coalesce(v_group.member_count, 0), p_group_id, v_group.creator_product_id, v_sort_order
  ) returning * into v_channel;

  return v_channel;
end;
$$;

create or replace function public.update_group_channel(
  p_channel_id uuid,
  p_name text,
  p_description text,
  p_icon text,
  p_channel_kind text
)
returns public.channels
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_group_id uuid;
  v_channel public.channels;
begin
  select channel.group_id into v_group_id from public.channels channel where channel.id = p_channel_id;
  if v_group_id is null or not private.can_manage_group_channels(v_group_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Channel management access required';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 48 then
    raise exception using errcode = '22023', message = 'Channel name must be between 2 and 48 characters';
  end if;
  if p_description is not null and char_length(btrim(p_description)) > 180 then
    raise exception using errcode = '22023', message = 'Channel description is too long';
  end if;
  if p_icon is not null and char_length(p_icon) > 16 then
    raise exception using errcode = '22023', message = 'Channel icon is too long';
  end if;
  if p_channel_kind not in ('text', 'live', 'picks', 'announcements') then
    raise exception using errcode = '22023', message = 'Invalid channel type';
  end if;

  update public.channels
  set name = btrim(p_name),
      description = nullif(btrim(p_description), ''),
      topic = nullif(btrim(p_description), ''),
      icon = coalesce(nullif(p_icon, ''), '#'),
      channel_kind = p_channel_kind
  where id = p_channel_id
  returning * into v_channel;
  return v_channel;
end;
$$;

create or replace function public.delete_group_channel(p_channel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_group_id uuid;
  v_primary_channel_id uuid;
begin
  select channel.group_id, community.channel_id
  into v_group_id, v_primary_channel_id
  from public.channels channel
  join public.groups community on community.id = channel.group_id
  where channel.id = p_channel_id;

  if v_group_id is null or not private.can_manage_group_channels(v_group_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Channel management access required';
  end if;
  if p_channel_id = v_primary_channel_id then
    raise exception using errcode = '22023', message = 'The primary channel cannot be deleted';
  end if;

  delete from public.channels where id = p_channel_id and group_id = v_group_id;
  return found;
end;
$$;

revoke all on function public.create_group_channel(uuid, text, text, text, text) from public, anon;
revoke all on function public.update_group_channel(uuid, text, text, text, text) from public, anon;
revoke all on function public.delete_group_channel(uuid) from public, anon;
grant execute on function public.create_group_channel(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_group_channel(uuid, text, text, text, text) to authenticated;
grant execute on function public.delete_group_channel(uuid) to authenticated;

drop policy if exists "Can send accessible message" on public.messages;
create policy "Can send accessible message"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and private.check_rate_limit('message:' || sender_id::text, 60, 60)
    and (
      (channel_id is not null and dm_recipient_id is null and private.can_post_channel(channel_id, (select auth.uid())))
      or
      (channel_id is null and dm_recipient_id is not null and dm_recipient_id <> (select auth.uid())
        and exists (select 1 from public.users recipient where recipient.id = dm_recipient_id and recipient.allow_dms = true)
        and not exists (
          select 1 from public.blocks
          where (blocker_id = (select auth.uid()) and blocked_id = dm_recipient_id)
             or (blocker_id = dm_recipient_id and blocked_id = (select auth.uid()))
        ))
    )
  );
