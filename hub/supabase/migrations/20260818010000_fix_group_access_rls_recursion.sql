-- Break the groups <-> group_members RLS cycle with one private,
-- SECURITY DEFINER authorization helper. The caller identity must match
-- auth.uid(), while table reads inside the helper bypass RLS.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.can_view_group(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_user_id is not null
    and p_user_id = (select auth.uid())
    and exists (
      select 1
      from public.groups g
      where g.id = p_group_id
        and (
          (g.access_type = 'free' and g.is_public)
          or g.owner_id = p_user_id
          or exists (
            select 1
            from public.group_members gm
            where gm.group_id = g.id and gm.user_id = p_user_id
          )
          or exists (
            select 1
            from public.creator_entitlements ce
            where ce.product_id = g.creator_product_id
              and ce.user_id = p_user_id
              and ce.status in ('active', 'trialing')
              and (ce.current_period_end is null or ce.current_period_end > now())
          )
        )
    );
$$;

revoke all on function private.can_view_group(uuid, uuid) from public, anon;
grant execute on function private.can_view_group(uuid, uuid) to authenticated, service_role;

drop policy if exists "Groups respect creator access" on public.groups;
drop policy if exists "Public groups are discoverable" on public.groups;
drop policy if exists "Authenticated users view accessible groups" on public.groups;

create policy "Public groups are discoverable"
on public.groups for select to anon
using (access_type = 'free' and is_public);

create policy "Authenticated users view accessible groups"
on public.groups for select to authenticated
using (private.can_view_group(id, (select auth.uid())));

drop policy if exists "Group members viewable" on public.group_members;
drop policy if exists "Accessible group members viewable" on public.group_members;

create policy "Accessible group members viewable"
on public.group_members for select to authenticated
using (private.can_view_group(group_id, (select auth.uid())));

