create table if not exists public.feature_rollouts (
  feature_key text primary key check (feature_key ~ '^feature_[a-z0-9_]{2,80}$'),
  audience text not null default 'everyone' check (audience in ('off', 'admins', 'members', 'percentage', 'everyone')),
  rollout_percent smallint not null default 100 check (rollout_percent between 0 and 100),
  rollout_salt uuid not null default gen_random_uuid(),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_rollout_overrides (
  feature_key text not null references public.feature_rollouts(feature_key) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  enabled boolean not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (feature_key, user_id)
);

create index if not exists feature_rollout_overrides_user_idx
  on public.feature_rollout_overrides(user_id, feature_key);

alter table public.feature_rollouts enable row level security;
alter table public.feature_rollout_overrides enable row level security;

create policy "Admins read feature rollouts"
on public.feature_rollouts for select to authenticated
using (
  exists (
    select 1 from public.users member
    where member.id = (select auth.uid()) and member.account_type = 'admin'
  )
);

create policy "Admins read feature rollout overrides"
on public.feature_rollout_overrides for select to authenticated
using (
  exists (
    select 1 from public.users member
    where member.id = (select auth.uid()) and member.account_type = 'admin'
  )
);

revoke all on public.feature_rollouts from public, anon, authenticated;
revoke all on public.feature_rollout_overrides from public, anon, authenticated;
grant select on public.feature_rollouts to authenticated;
grant select on public.feature_rollout_overrides to authenticated;

insert into public.feature_rollouts(feature_key, audience, rollout_percent)
values
  ('feature_marketplace', 'everyone', 100),
  ('feature_pages', 'everyone', 100),
  ('feature_blog', 'everyone', 100),
  ('feature_forum', 'everyone', 100),
  ('feature_groups', 'everyone', 100),
  ('feature_events', 'everyone', 100),
  ('feature_stories', 'everyone', 100),
  ('feature_polls', 'everyone', 100),
  ('feature_watchlist', 'everyone', 100)
on conflict (feature_key) do nothing;
