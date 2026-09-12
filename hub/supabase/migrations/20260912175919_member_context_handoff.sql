create table if not exists public.member_context_handoff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  path text not null,
  page_title text,
  scroll_y integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint member_context_handoff_internal_path check (
    path like '/%'
    and path not like '//%'
    and char_length(path) <= 900
    and path !~ '[[:cntrl:]]'
    and path !~ '^/(api|auth|admin)(/|$)'
  ),
  constraint member_context_handoff_scroll check (scroll_y between 0 and 10000000),
  constraint member_context_handoff_title_length check (char_length(coalesce(page_title, '')) <= 160)
);

alter table public.member_context_handoff enable row level security;

create policy "Members read their own context handoff"
  on public.member_context_handoff for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Members create their own context handoff"
  on public.member_context_handoff for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Members update their own context handoff"
  on public.member_context_handoff for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists member_context_handoff_updated_at_idx
  on public.member_context_handoff (updated_at desc);

revoke all on table public.member_context_handoff from anon;
grant select, insert, update on table public.member_context_handoff to authenticated;
