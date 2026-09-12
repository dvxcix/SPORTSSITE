alter table public.posts
  add column if not exists is_spoiler boolean not null default false;
