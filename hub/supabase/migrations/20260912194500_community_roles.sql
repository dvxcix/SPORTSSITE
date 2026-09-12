alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members add constraint group_members_role_check
  check (role in ('owner','admin','moderator','analyst','subscriber','member'));

create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_role not in ('admin','moderator','analyst','subscriber','member') then raise exception 'Invalid role'; end if;
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid() and role='owner') then raise exception 'Only the owner can change roles'; end if;
  if exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id and role='owner') then raise exception 'The owner role cannot be changed'; end if;
  update public.group_members set role=p_role where group_id=p_group_id and user_id=p_user_id;
  if not found then raise exception 'Member not found'; end if;
end; $$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid() and role='owner') then raise exception 'Only the owner can remove members'; end if;
  if exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id and role='owner') then raise exception 'The owner cannot be removed'; end if;
  delete from public.group_members where group_id=p_group_id and user_id=p_user_id;
end; $$;

revoke all on function public.set_group_member_role(uuid,uuid,text) from public;
revoke all on function public.remove_group_member(uuid,uuid) from public;
grant execute on function public.set_group_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
