create table if not exists public.creator_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  post_type text not null default 'text' check (post_type in ('text', 'analysis')),
  sport text null check (sport is null or sport in ('MLB', 'NFL', 'NBA', 'NHL', 'NCAAF', 'NCAAB')),
  visibility text not null default 'public' check (visibility in ('public', 'followers', 'premium')),
  media_urls text[] not null default '{}',
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('draft', 'scheduled', 'publishing', 'published', 'canceled', 'failed')),
  published_post_id uuid null references public.posts(id) on delete set null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_scheduled_posts_due_idx on public.creator_scheduled_posts (scheduled_for)
  where status = 'scheduled';
create index if not exists creator_scheduled_posts_creator_idx on public.creator_scheduled_posts (creator_id, scheduled_for desc);

alter table public.creator_scheduled_posts enable row level security;
create policy "Creators read own scheduled posts" on public.creator_scheduled_posts for select using (creator_id = (select auth.uid()));
create policy "Creators create own scheduled posts" on public.creator_scheduled_posts for insert with check (creator_id = (select auth.uid()));
create policy "Creators update own unpublished posts" on public.creator_scheduled_posts for update
  using (creator_id = (select auth.uid()) and status in ('draft', 'scheduled', 'failed'))
  with check (creator_id = (select auth.uid()));
create policy "Creators delete own unpublished posts" on public.creator_scheduled_posts for delete
  using (creator_id = (select auth.uid()) and status in ('draft', 'scheduled', 'failed', 'canceled'));
grant select, insert, update, delete on public.creator_scheduled_posts to authenticated;

create or replace function public.set_creator_scheduled_post_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_creator_scheduled_post_updated_at on public.creator_scheduled_posts;
create trigger set_creator_scheduled_post_updated_at before update on public.creator_scheduled_posts
for each row execute function public.set_creator_scheduled_post_updated_at();
