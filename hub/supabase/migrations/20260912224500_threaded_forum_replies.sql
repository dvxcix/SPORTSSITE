alter table public.forum_replies
  add column if not exists parent_reply_id uuid references public.forum_replies(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists is_deleted boolean not null default false;

create index if not exists idx_forum_replies_parent_reply_id
  on public.forum_replies(parent_reply_id)
  where parent_reply_id is not null;

drop policy if exists forum_replies_update_own on public.forum_replies;
create policy forum_replies_update_own
  on public.forum_replies for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

comment on column public.forum_replies.parent_reply_id is
  'Optional reply target used for durable nested discussion threads.';
