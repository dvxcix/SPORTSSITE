alter table public.posts
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.posts
  drop constraint if exists posts_attachments_array_check;
alter table public.posts
  add constraint posts_attachments_array_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6);

create table if not exists public.research_workspace_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.research_workspaces(id) on delete cascade,
  added_by uuid not null references public.users(id) on delete cascade,
  item_type text not null check (item_type in ('slate_edge_player')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  source_path text not null check (char_length(source_path) between 1 and 1000 and source_path like '/dugout%' and source_path not like '//%'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists research_workspace_items_workspace_recent_idx
  on public.research_workspace_items(workspace_id, created_at desc);

alter table public.research_workspace_items enable row level security;

create policy "Collaborators read workspace evidence"
on public.research_workspace_items for select to authenticated
using (private.can_view_research_workspace(workspace_id));

create policy "Editors add workspace evidence"
on public.research_workspace_items for insert to authenticated
with check (added_by = (select auth.uid()) and private.can_edit_research_workspace(workspace_id));

create policy "Editors remove workspace evidence"
on public.research_workspace_items for delete to authenticated
using (private.can_edit_research_workspace(workspace_id));

revoke all on public.research_workspace_items from public, anon, authenticated;
grant select, insert, delete on public.research_workspace_items to authenticated;
