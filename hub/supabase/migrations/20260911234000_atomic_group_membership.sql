drop policy if exists "Users can join groups" on public.group_members;
create policy "Users can join accessible groups"
on public.group_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (
      role = 'owner'
      and exists (
        select 1 from public.groups g
        where g.id = group_id and g.owner_id = (select auth.uid())
      )
    )
    or (
      role = 'member'
      and exists (
        select 1 from public.groups g
        where g.id = group_id
          and (
            (g.is_public and g.access_type = 'free')
            or g.owner_id = (select auth.uid())
            or exists (
              select 1 from public.creator_entitlements ce
              where ce.product_id = g.creator_product_id
                and ce.user_id = (select auth.uid())
                and ce.status in ('active', 'trialing')
                and (ce.current_period_end is null or ce.current_period_end > now())
            )
            or exists (
              select 1 from public.group_invites gi
              where gi.group_id = g.id
                and gi.invited_user_id = (select auth.uid())
                and gi.status = 'accepted'
            )
          )
      )
    )
  )
);

drop policy if exists "Users can leave groups" on public.group_members;
create policy "Members can leave groups"
on public.group_members for delete to authenticated
using (user_id = (select auth.uid()) and role <> 'owner');

drop policy if exists "Can join" on public.channel_members;
create policy "Users can join accessible channels"
on public.channel_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.channels c
    where c.id = channel_id
      and (
        c.owner_id = (select auth.uid())
        or (c.channel_type = 'public' and c.creator_product_id is null)
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = c.group_id and gm.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.creator_entitlements ce
          where ce.product_id = c.creator_product_id
            and ce.user_id = (select auth.uid())
            and ce.status in ('active', 'trialing')
            and (ce.current_period_end is null or ce.current_period_end > now())
        )
      )
  )
);

create or replace function public.set_group_membership(p_group_id uuid, p_join boolean)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_channel_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select g.channel_id into v_channel_id
  from public.groups g
  where g.id = p_group_id;

  if not found then
    raise exception 'Group not found';
  end if;

  if p_join then
    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_user_id, 'member')
    on conflict (group_id, user_id) do nothing;

    if v_channel_id is not null then
      insert into public.channel_members (channel_id, user_id)
      values (v_channel_id, v_user_id)
      on conflict (channel_id, user_id) do nothing;
    end if;
    return true;
  end if;

  select gm.role into v_role
  from public.group_members gm
  where gm.group_id = p_group_id and gm.user_id = v_user_id;

  if v_role = 'owner' then
    raise exception 'Owners cannot leave their group';
  end if;

  if v_channel_id is not null then
    delete from public.channel_members
    where channel_id = v_channel_id and user_id = v_user_id;
  end if;
  delete from public.group_members
  where group_id = p_group_id and user_id = v_user_id;
  return false;
end;
$$;

create or replace function public.respond_to_group_invite(p_invite_id uuid, p_accept boolean)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_channel_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select gi.group_id, gi.status into v_group_id, v_status
  from public.group_invites gi
  where gi.id = p_invite_id and gi.invited_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;
  if v_status <> 'pending' and not (p_accept and v_status = 'accepted') then
    raise exception 'Invite is no longer pending';
  end if;

  update public.group_invites
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_invite_id;

  if not p_accept then
    return false;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  select g.channel_id into v_channel_id from public.groups g where g.id = v_group_id;
  if v_channel_id is not null then
    insert into public.channel_members (channel_id, user_id)
    values (v_channel_id, v_user_id)
    on conflict (channel_id, user_id) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function public.set_group_membership(uuid, boolean) from public, anon;
grant execute on function public.set_group_membership(uuid, boolean) to authenticated;
revoke all on function public.respond_to_group_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_to_group_invite(uuid, boolean) to authenticated;
