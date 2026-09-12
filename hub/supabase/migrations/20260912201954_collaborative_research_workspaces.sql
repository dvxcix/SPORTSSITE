alter table public.research_workspaces
  add column if not exists description text not null default '' check (char_length(description) <= 500);

create table if not exists public.research_workspace_members (
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer', 'editor')),
  invited_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.research_workspace_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_workspace_presence (
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists research_workspace_members_user_idx on public.research_workspace_members(user_id, workspace_id);
create index if not exists research_workspace_comments_recent_idx on public.research_workspace_comments(workspace_id, created_at desc);
create index if not exists research_workspace_presence_recent_idx on public.research_workspace_presence(workspace_id, last_seen_at desc);

create or replace function private.can_view_research_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, private as $$
  select auth.uid() is not null and (
    exists (select 1 from public.research_workspaces workspace where workspace.id = p_workspace_id and workspace.user_id = auth.uid())
    or exists (select 1 from public.research_workspace_members membership where membership.workspace_id = p_workspace_id and membership.user_id = auth.uid())
  );
$$;

create or replace function private.can_edit_research_workspace(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public, private as $$
  select auth.uid() is not null and (
    exists (select 1 from public.research_workspaces workspace where workspace.id = p_workspace_id and workspace.user_id = auth.uid())
    or exists (select 1 from public.research_workspace_members membership where membership.workspace_id = p_workspace_id and membership.user_id = auth.uid() and membership.role = 'editor')
  );
$$;

revoke all on function private.can_view_research_workspace(uuid) from public;
revoke all on function private.can_edit_research_workspace(uuid) from public;
grant execute on function private.can_view_research_workspace(uuid) to authenticated;
grant execute on function private.can_edit_research_workspace(uuid) to authenticated;

create policy "Collaborators read shared research workspaces"
on public.research_workspaces for select to authenticated
using (private.can_view_research_workspace(id));

create policy "Editors update shared research workspaces"
on public.research_workspaces for update to authenticated
using (private.can_edit_research_workspace(id))
with check (private.can_edit_research_workspace(id));

revoke update on public.research_workspaces from authenticated;

alter table public.research_workspace_members enable row level security;
alter table public.research_workspace_comments enable row level security;
alter table public.research_workspace_presence enable row level security;

create policy "Collaborators read workspace members"
on public.research_workspace_members for select to authenticated
using (private.can_view_research_workspace(workspace_id));

create policy "Members remove themselves from workspaces"
on public.research_workspace_members for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Collaborators read workspace comments"
on public.research_workspace_comments for select to authenticated
using (private.can_view_research_workspace(workspace_id));
create policy "Collaborators create workspace comments"
on public.research_workspace_comments for insert to authenticated
with check (user_id = (select auth.uid()) and private.can_view_research_workspace(workspace_id));
create policy "Authors update workspace comments"
on public.research_workspace_comments for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and private.can_view_research_workspace(workspace_id));
create policy "Authors remove workspace comments"
on public.research_workspace_comments for delete to authenticated
using (user_id = (select auth.uid()));

create policy "Collaborators read workspace presence"
on public.research_workspace_presence for select to authenticated
using (private.can_view_research_workspace(workspace_id));
create policy "Collaborators create own workspace presence"
on public.research_workspace_presence for insert to authenticated
with check (user_id = (select auth.uid()) and private.can_view_research_workspace(workspace_id));
create policy "Collaborators update own workspace presence"
on public.research_workspace_presence for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and private.can_view_research_workspace(workspace_id));

revoke all on public.research_workspace_members, public.research_workspace_comments, public.research_workspace_presence from public, anon, authenticated;
grant select, delete on public.research_workspace_members to authenticated;
grant select, insert, update, delete on public.research_workspace_comments to authenticated;
grant select, insert, update on public.research_workspace_presence to authenticated;

create or replace function public.invite_research_workspace_member(p_workspace_id uuid, p_username text, p_role text default 'viewer')
returns uuid language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_user_id uuid;
begin
  if p_role not in ('viewer', 'editor') then raise exception 'invalid role'; end if;
  if not exists (select 1 from public.research_workspaces where id = p_workspace_id and user_id = auth.uid()) then raise exception 'forbidden'; end if;
  select id into v_user_id from public.users where lower(username) = lower(btrim(p_username)) limit 1;
  if v_user_id is null or v_user_id = auth.uid() then raise exception 'member unavailable'; end if;
  insert into public.research_workspace_members(workspace_id, user_id, role, invited_by)
  values (p_workspace_id, v_user_id, p_role, auth.uid())
  on conflict (workspace_id, user_id) do update set role = excluded.role, invited_by = auth.uid();
  return v_user_id;
end;
$$;

create or replace function public.save_research_workspace_board(
  p_workspace_id uuid,
  p_watchlist_item_ids uuid[],
  p_mlb_matrix_ids uuid[],
  p_nfl_matrix_ids uuid[]
)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if not private.can_edit_research_workspace(p_workspace_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_watchlist_item_ids), 0) > 100 or coalesce(cardinality(p_mlb_matrix_ids), 0) > 100 or coalesce(cardinality(p_nfl_matrix_ids), 0) > 100 then raise exception 'workspace limit exceeded'; end if;
  update public.research_workspaces set
    watchlist_item_ids = coalesce(p_watchlist_item_ids, '{}'),
    mlb_matrix_ids = coalesce(p_mlb_matrix_ids, '{}'),
    nfl_matrix_ids = coalesce(p_nfl_matrix_ids, '{}')
  where id = p_workspace_id;
  return found;
end;
$$;

create or replace function public.remove_research_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if auth.uid() <> p_user_id and not exists (select 1 from public.research_workspaces where id = p_workspace_id and user_id = auth.uid()) then raise exception 'forbidden'; end if;
  delete from public.research_workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  return found;
end;
$$;

revoke all on function public.invite_research_workspace_member(uuid, text, text) from public;
revoke all on function public.remove_research_workspace_member(uuid, uuid) from public;
revoke all on function public.save_research_workspace_board(uuid, uuid[], uuid[], uuid[]) from public;
grant execute on function public.invite_research_workspace_member(uuid, text, text) to authenticated;
grant execute on function public.remove_research_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.save_research_workspace_board(uuid, uuid[], uuid[], uuid[]) to authenticated;

drop trigger if exists set_research_workspace_comments_updated_at on public.research_workspace_comments;
create trigger set_research_workspace_comments_updated_at before update on public.research_workspace_comments
for each row execute function public.set_research_updated_at();
