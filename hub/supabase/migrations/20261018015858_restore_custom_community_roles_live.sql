-- Approved and applied individually to SlipSurge production; do not replay historical migrations.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $guard$ begin
 if to_regclass('public.community_roles') is not null then raise exception 'Repair precondition failed: community_roles already exists; reconcile schema first'; end if;
 if to_regclass('public.community_member_roles') is not null then raise exception 'Repair precondition failed: community_member_roles already exists; reconcile schema first'; end if;
 if to_regclass('public.community_channel_role_overrides') is not null then raise exception 'Repair precondition failed: community_channel_role_overrides already exists; reconcile schema first'; end if;
 if md5(pg_get_functiondef('private.can_access_channel(uuid,uuid)'::regprocedure)) <> 'b689a76dd5b64626083852992c874179' then raise exception 'Live function changed: private.can_access_channel(uuid,uuid); refresh review'; end if;
 if md5(pg_get_functiondef('private.can_manage_group_channels(uuid,uuid)'::regprocedure)) <> '14d4af0287feb9c22c2ed4a4c667800e' then raise exception 'Live function changed: private.can_manage_group_channels(uuid,uuid); refresh review'; end if;
 if md5(pg_get_functiondef('private.can_post_channel(uuid,uuid)'::regprocedure)) <> 'f79c9ff1762d164b690414885081d324' then raise exception 'Live function changed: private.can_post_channel(uuid,uuid); refresh review'; end if;
 if md5(pg_get_functiondef('private.is_group_member(uuid,uuid)'::regprocedure)) <> '5d3487589dadee5141f04df2b934a0d9' then raise exception 'Live function changed: private.is_group_member(uuid,uuid); refresh review'; end if;
 if md5(pg_get_functiondef('public.remove_group_member(uuid,uuid)'::regprocedure)) <> '3ec70aa93ef4c724f2dce1e594244108' then raise exception 'Live function changed: public.remove_group_member(uuid,uuid); refresh review'; end if;
end $guard$;
create table if not exists public.community_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 32),
  color text not null default '#b4ff4d' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  is_default boolean not null default false,
  permissions jsonb not null default '{"view_channels":true,"send_messages":true,"manage_messages":false,"manage_channels":false,"manage_roles":false,"manage_members":false,"create_invites":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);

create unique index if not exists community_roles_name_unique
  on public.community_roles(group_id, lower(name));
create unique index if not exists community_roles_default_unique
  on public.community_roles(group_id) where is_default;

create table if not exists public.community_member_roles (
  group_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id, role_id),
  foreign key (group_id, user_id) references public.group_members(group_id, user_id) on delete cascade,
  foreign key (role_id, group_id) references public.community_roles(id, group_id) on delete cascade
);

create table if not exists public.community_channel_role_overrides (
  channel_id uuid not null references public.channels(id) on delete cascade,
  role_id uuid not null references public.community_roles(id) on delete cascade,
  can_view boolean,
  can_send boolean,
  can_manage_messages boolean,
  updated_at timestamptz not null default now(),
  primary key (channel_id, role_id)
);

create index if not exists community_member_roles_role_idx on public.community_member_roles(role_id);
create index if not exists community_channel_role_overrides_role_idx on public.community_channel_role_overrides(role_id);
create index if not exists community_roles_group_position_idx on public.community_roles(group_id, position);

alter table public.community_roles enable row level security;
alter table public.community_member_roles enable row level security;
alter table public.community_channel_role_overrides enable row level security;

create or replace function private.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select p_user_id is not null and exists (
    select 1 from public.group_members
    where group_id=p_group_id and user_id=p_user_id
  );
$$;

create or replace function private.community_has_permission(p_group_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select p_user_id is not null and private.is_group_member(p_group_id,p_user_id) and (
    exists (
      select 1 from public.group_members gm
      where gm.group_id=p_group_id and gm.user_id=p_user_id
        and (
          gm.role in ('owner','admin')
          or (gm.role='moderator' and p_permission in ('view_channels','send_messages','manage_messages','create_invites'))
          or (gm.role in ('analyst','subscriber','member') and p_permission in ('view_channels','send_messages'))
        )
    )
    or exists (
      select 1
      from public.community_roles role
      left join public.community_member_roles assignment
        on assignment.role_id=role.id and assignment.group_id=role.group_id and assignment.user_id=p_user_id
      where role.group_id=p_group_id
        and (role.is_default or assignment.user_id is not null)
        and coalesce((role.permissions->>p_permission)::boolean,false)
    )
  );
$$;

create or replace function private.community_channel_permission(p_channel_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
  with target as (
    select c.group_id from public.channels c where c.id=p_channel_id
  ), applicable as (
    select override.can_view, override.can_send, override.can_manage_messages
    from target
    join public.community_roles role on role.group_id=target.group_id
    left join public.community_member_roles assignment
      on assignment.role_id=role.id and assignment.group_id=role.group_id and assignment.user_id=p_user_id
    join public.community_channel_role_overrides override
      on override.channel_id=p_channel_id and override.role_id=role.id
    where role.is_default or assignment.user_id is not null
  ), decisions as (
    select case p_permission
      when 'view_channels' then can_view
      when 'send_messages' then can_send
      when 'manage_messages' then can_manage_messages
      else null
    end as decision
    from applicable
  )
  select case
    when not coalesce((select private.is_group_member(group_id,p_user_id) from target),false) then false
    when exists(select 1 from public.group_members gm join target on target.group_id=gm.group_id where gm.user_id=p_user_id and gm.role in ('owner','admin')) then true
    when exists(select 1 from decisions where decision is true) then true
    when exists(select 1 from decisions where decision is false) then false
    else coalesce((select private.community_has_permission(group_id,p_user_id,p_permission) from target),false)
  end;
$$;

revoke all on function private.is_group_member(uuid,uuid) from public,anon;
revoke all on function private.community_has_permission(uuid,uuid,text) from public,anon;
revoke all on function private.community_channel_permission(uuid,uuid,text) from public,anon;
grant execute on function private.is_group_member(uuid,uuid) to authenticated,service_role;
grant execute on function private.community_has_permission(uuid,uuid,text) to authenticated,service_role;
grant execute on function private.community_channel_permission(uuid,uuid,text) to authenticated,service_role;

drop policy if exists "Members read community roles" on public.community_roles;
create policy "Members read community roles" on public.community_roles for select to authenticated
using (private.is_group_member(group_id,(select auth.uid())));
drop policy if exists "Members read community role assignments" on public.community_member_roles;
create policy "Members read community role assignments" on public.community_member_roles for select to authenticated
using (private.is_group_member(group_id,(select auth.uid())));
drop policy if exists "Members read channel role overrides" on public.community_channel_role_overrides;
create policy "Members read channel role overrides" on public.community_channel_role_overrides for select to authenticated
using (exists (
  select 1 from public.channels c
  where c.id=channel_id and private.is_group_member(c.group_id,(select auth.uid()))
));

revoke all on public.community_roles, public.community_member_roles, public.community_channel_role_overrides from public, anon, authenticated;
grant select on public.community_roles, public.community_member_roles, public.community_channel_role_overrides to authenticated;
revoke insert,update,delete on public.community_roles, public.community_member_roles, public.community_channel_role_overrides from anon,authenticated;

create or replace function private.can_manage_community_roles(p_group_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
  select private.community_has_permission(p_group_id,p_user_id,'manage_roles');
$$;
revoke all on function private.can_manage_community_roles(uuid,uuid) from public,anon;
grant execute on function private.can_manage_community_roles(uuid,uuid) to authenticated,service_role;

create or replace function public.create_community_role(p_group_id uuid,p_name text,p_color text default '#b4ff4d')
returns public.community_roles language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_role public.community_roles;
begin
  if not private.can_manage_community_roles(p_group_id,auth.uid()) then raise exception using errcode='42501',message='Role management access required'; end if;
  if char_length(btrim(p_name)) not between 1 and 32 then raise exception using errcode='22023',message='Role name must be between 1 and 32 characters'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception using errcode='22023',message='Invalid role color'; end if;
  insert into public.community_roles(group_id,name,color,position)
  values(p_group_id,btrim(p_name),lower(p_color),coalesce((select max(position)+10 from public.community_roles where group_id=p_group_id),10))
  returning * into v_role;
  return v_role;
end; $$;

create or replace function public.update_community_role(p_role_id uuid,p_name text,p_color text,p_permissions jsonb)
returns public.community_roles language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_role public.community_roles; v_group_id uuid;
begin
  select group_id into v_group_id from public.community_roles where id=p_role_id;
  if not private.can_manage_community_roles(v_group_id,auth.uid()) then raise exception using errcode='42501',message='Role management access required'; end if;
  if char_length(btrim(p_name)) not between 1 and 32 then raise exception using errcode='22023',message='Role name must be between 1 and 32 characters'; end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception using errcode='22023',message='Invalid role color'; end if;
  update public.community_roles set
    name=btrim(p_name),color=lower(p_color),
    permissions=jsonb_build_object(
      'view_channels',coalesce((p_permissions->>'view_channels')::boolean,false),
      'send_messages',coalesce((p_permissions->>'send_messages')::boolean,false),
      'manage_messages',coalesce((p_permissions->>'manage_messages')::boolean,false),
      'manage_channels',coalesce((p_permissions->>'manage_channels')::boolean,false),
      'manage_roles',case when is_default then false else coalesce((p_permissions->>'manage_roles')::boolean,false) end,
      'manage_members',coalesce((p_permissions->>'manage_members')::boolean,false),
      'create_invites',coalesce((p_permissions->>'create_invites')::boolean,false)
    ),updated_at=now()
  where id=p_role_id returning * into v_role;
  return v_role;
end; $$;

create or replace function public.delete_community_role(p_role_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_group_id uuid; v_default boolean;
begin
  select group_id,is_default into v_group_id,v_default from public.community_roles where id=p_role_id;
  if not private.can_manage_community_roles(v_group_id,auth.uid()) then raise exception using errcode='42501',message='Role management access required'; end if;
  if v_default then raise exception using errcode='22023',message='Default role cannot be deleted'; end if;
  delete from public.community_roles where id=p_role_id;
  return found;
end; $$;

create or replace function public.set_community_member_role(p_group_id uuid,p_user_id uuid,p_role_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if not private.can_manage_community_roles(p_group_id,auth.uid()) then raise exception using errcode='42501',message='Role management access required'; end if;
  if not exists(select 1 from public.community_roles where id=p_role_id and group_id=p_group_id and not is_default) then raise exception using errcode='22023',message='Invalid role'; end if;
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id) then raise exception using errcode='22023',message='Member not found'; end if;
  if p_enabled then
    insert into public.community_member_roles(group_id,user_id,role_id) values(p_group_id,p_user_id,p_role_id) on conflict do nothing;
  else
    delete from public.community_member_roles where group_id=p_group_id and user_id=p_user_id and role_id=p_role_id;
  end if;
  return p_enabled;
end; $$;

create or replace function public.set_channel_role_override(p_channel_id uuid,p_role_id uuid,p_can_view boolean,p_can_send boolean,p_can_manage_messages boolean)
returns public.community_channel_role_overrides language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_group_id uuid; v_result public.community_channel_role_overrides;
begin
  select group_id into v_group_id from public.channels where id=p_channel_id;
  if not private.can_manage_community_roles(v_group_id,auth.uid()) then raise exception using errcode='42501',message='Role management access required'; end if;
  if not exists(select 1 from public.community_roles where id=p_role_id and group_id=v_group_id) then raise exception using errcode='22023',message='Invalid role'; end if;
  insert into public.community_channel_role_overrides(channel_id,role_id,can_view,can_send,can_manage_messages)
  values(p_channel_id,p_role_id,p_can_view,p_can_send,p_can_manage_messages)
  on conflict(channel_id,role_id) do update set can_view=excluded.can_view,can_send=excluded.can_send,can_manage_messages=excluded.can_manage_messages,updated_at=now()
  returning * into v_result;
  return v_result;
end; $$;

revoke all on function public.create_community_role(uuid,text,text) from public,anon;
revoke all on function public.update_community_role(uuid,text,text,jsonb) from public,anon;
revoke all on function public.delete_community_role(uuid) from public,anon;
revoke all on function public.set_community_member_role(uuid,uuid,uuid,boolean) from public,anon;
revoke all on function public.set_channel_role_override(uuid,uuid,boolean,boolean,boolean) from public,anon;
grant execute on function public.create_community_role(uuid,text,text) to authenticated;
grant execute on function public.update_community_role(uuid,text,text,jsonb) to authenticated;
grant execute on function public.delete_community_role(uuid) to authenticated;
grant execute on function public.set_community_member_role(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.set_channel_role_override(uuid,uuid,boolean,boolean,boolean) to authenticated;

create or replace function private.can_manage_group_channels(p_group_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
  select p_user_id is not null and p_user_id=(select auth.uid())
    and private.community_has_permission(p_group_id,p_user_id,'manage_channels');
$$;
revoke all on function private.can_manage_group_channels(uuid,uuid) from public,anon;
grant execute on function private.can_manage_group_channels(uuid,uuid) to authenticated,service_role;

create or replace function public.get_my_community_permissions(p_group_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private as $$
  select jsonb_build_object(
    'view_channels',private.community_has_permission(p_group_id,auth.uid(),'view_channels'),
    'send_messages',private.community_has_permission(p_group_id,auth.uid(),'send_messages'),
    'manage_messages',private.community_has_permission(p_group_id,auth.uid(),'manage_messages'),
    'manage_channels',private.community_has_permission(p_group_id,auth.uid(),'manage_channels'),
    'manage_roles',private.community_has_permission(p_group_id,auth.uid(),'manage_roles'),
    'manage_members',private.community_has_permission(p_group_id,auth.uid(),'manage_members'),
    'create_invites',private.community_has_permission(p_group_id,auth.uid(),'create_invites')
  );
$$;

create or replace function public.get_my_channel_permissions(p_channel_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,private as $$
  select jsonb_build_object(
    'view',private.community_channel_permission(p_channel_id,auth.uid(),'view_channels'),
    'send',private.can_post_channel(p_channel_id,auth.uid()),
    'moderate',private.community_channel_permission(p_channel_id,auth.uid(),'manage_messages')
  );
$$;

create or replace function public.invite_community_member(p_group_id uuid,p_invited_user_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if auth.uid() is null or not private.community_has_permission(p_group_id,auth.uid(),'create_invites') then
    raise exception using errcode='42501',message='Invite access required';
  end if;
  if p_invited_user_id=auth.uid() or exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_invited_user_id) then
    raise exception using errcode='22023',message='Member is already in this community';
  end if;
  insert into public.group_invites(group_id,invited_user_id,invited_by,status)
  values(p_group_id,p_invited_user_id,auth.uid(),'pending');
  return true;
exception when unique_violation then
  update public.group_invites set invited_by=auth.uid(),status='pending'
  where group_id=p_group_id and invited_user_id=p_invited_user_id;
  return true;
end; $$;

create or replace function public.remove_group_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $$
begin
  if not private.community_has_permission(p_group_id,auth.uid(),'manage_members') then raise exception using errcode='42501',message='Member management access required'; end if;
  if exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id and role in ('owner','admin')) then raise exception using errcode='42501',message='Owners and admins cannot be removed by role managers'; end if;
  delete from public.group_members where group_id=p_group_id and user_id=p_user_id;
end; $$;

revoke all on function public.get_my_community_permissions(uuid) from public,anon;
revoke all on function public.get_my_channel_permissions(uuid) from public,anon;
revoke all on function public.invite_community_member(uuid,uuid) from public,anon;
revoke all on function public.remove_group_member(uuid,uuid) from public,anon;
grant execute on function public.get_my_community_permissions(uuid) to authenticated;
grant execute on function public.get_my_channel_permissions(uuid) to authenticated;
grant execute on function public.invite_community_member(uuid,uuid) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;

create or replace function private.seed_community_default_role()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  insert into public.community_roles(group_id,name,color,is_default,position)
  values(new.id,'Everyone','#94a3b8',true,0) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists seed_community_default_role on public.groups;
create trigger seed_community_default_role after insert on public.groups
for each row execute function private.seed_community_default_role();
insert into public.community_roles(group_id,name,color,is_default,position)
select id,'Everyone','#94a3b8',true,0 from public.groups on conflict do nothing;

create or replace function private.can_access_channel(target_channel_id uuid,viewer_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
  select viewer_id is not null and exists(
    select 1 from public.channels c
    where c.id=target_channel_id
      and (
        c.owner_id=viewer_id
        or (
          ((c.channel_type='public' and c.creator_product_id is null)
            or exists(select 1 from public.channel_members cm where cm.channel_id=c.id and cm.user_id=viewer_id)
            or exists(select 1 from public.group_members gm where gm.group_id=c.group_id and gm.user_id=viewer_id)
            or exists(select 1 from public.creator_entitlements ce where ce.product_id=c.creator_product_id and ce.user_id=viewer_id and ce.status in ('active','trialing') and (ce.current_period_end is null or ce.current_period_end>now())))
          and (c.group_id is null or not private.is_group_member(c.group_id,viewer_id) or private.community_channel_permission(c.id,viewer_id,'view_channels'))
        )
      )
  );
$$;

create or replace function private.can_post_channel(p_channel_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,private as $$
  select private.can_access_channel(p_channel_id,p_user_id)
    and exists(
      select 1 from public.channels c where c.id=p_channel_id
        and (
          (c.group_id is null and (c.channel_kind<>'announcements' or c.owner_id=p_user_id))
          or (
            private.community_channel_permission(c.id,p_user_id,'send_messages')
            and (c.channel_kind<>'announcements' or private.community_has_permission(c.group_id,p_user_id,'manage_messages'))
          )
        )
    );
$$;


revoke all on function private.seed_community_default_role() from public, anon, authenticated;

grant all on table public.community_roles to service_role;
grant all on table public.community_member_roles to service_role;
grant all on table public.community_channel_role_overrides to service_role;
commit;
